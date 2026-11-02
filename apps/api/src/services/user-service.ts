import { createHash, randomBytes } from 'node:crypto';
import {
  SCHEDULER_EMAIL,
  SUBURBS,
  suburbLocation,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type CreateUserResponse,
  type ListUsersQuery,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordResponse,
  type Role,
  type SessionResponse,
  type UpdateMeRequest,
  type UpdateUserRequest,
  type UserListResponse,
  type UserResponse,
} from '@fedsa/contract';
import bcrypt from 'bcryptjs';
import { mongo, Types } from 'mongoose';
import {
  runInTransaction,
  type LoginThrottleRepository,
  type OrganisationDoc,
  type OrganisationRepository,
  type SessionRepository,
  type UserRepository,
} from '../db/index.js';
import {
  InvalidStateError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '../errors.js';
import type { AuditService } from './audit-service.js';
import { organisationView, userView } from './views.js';

export const BCRYPT_COST = 12;

/** registration, password changes and the seeded accounts all hash this way */
export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** the privacy notice a user agreed to. change it when the notice changes */
export const CONSENT_VERSION = '2026-10';

/** only recipients are vetted before they can claim */
const STARTING_STATUS = { donor: 'active', recipient: 'pending' } as const;

/** one message for every failure, so a caller cannot tell which accounts exist */
const LOGIN_FAILED = 'The email or password is not correct';

const DUPLICATE_KEY = 11000;

/** failures on one email, from any address, before each further one delays the next attempt */
const FREE_LOGIN_FAILURES = 9;
const FIRST_LOGIN_DELAY_MS = 60 * 1000;
const MAX_LOGIN_DELAY_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_MEMORY_MS = 24 * 60 * 60 * 1000;

/** one minute at the 10th failure. each later one doubles it, up to 15 minutes */
export function loginDelayMs(failures: number) {
  if (failures <= FREE_LOGIN_FAILURES) return 0;
  return Math.min(
    MAX_LOGIN_DELAY_MS,
    FIRST_LOGIN_DELAY_MS * 2 ** (failures - FREE_LOGIN_FAILURES - 1),
  );
}

function throttleKey(email: string) {
  return createHash('sha256').update(email).digest('hex');
}

const AUDIT_TARGET = 'users';

/** staff have no organisation and members need one. a role never changes from one group to the other */
const STAFF_ROLES: readonly Role[] = ['coordinator', 'administrator'];

/** 16 URL-safe characters, inside the password length rule */
function newTemporaryPassword() {
  return randomBytes(12).toString('base64url');
}

/** what the guards need, read from the database on every request */
export interface SessionUser {
  id: string;
  role: Role;
  organisationId: string | null;
  mustChangePassword: boolean;
}

export class UserService {
  private readonly users: UserRepository;
  private readonly organisations: OrganisationRepository;
  private readonly sessions: SessionRepository;
  private readonly audit: AuditService;
  private readonly throttle: LoginThrottleRepository;
  private unknownUserHash: Promise<string> | undefined;

  constructor(
    users: UserRepository,
    organisations: OrganisationRepository,
    sessions: SessionRepository,
    audit: AuditService,
    throttle: LoginThrottleRepository,
  ) {
    this.users = users;
    this.organisations = organisations;
    this.sessions = sessions;
    this.audit = audit;
    this.throttle = throttle;
  }

  async register(input: RegisterRequest): Promise<SessionResponse> {
    const passwordHash = await hashPassword(input.user.password);

    try {
      return await runInTransaction(async (session) => {
        const organisation = await this.organisations.create(this.newOrganisation(input), session);
        const user = await this.users.create(
          {
            organisationId: organisation._id,
            role: input.role,
            fullName: input.user.fullName,
            email: input.user.email,
            passwordHash,
            phone: input.user.phone,
            languagePreference: input.user.languagePreference,
            status: 'active',
            mustChangePassword: false,
            consentedAt: new Date(),
            consentVersion: CONSENT_VERSION,
          },
          session,
        );
        return { user: userView(user), organisation: organisationView(organisation) };
      });
    } catch (err) {
      if (err instanceof mongo.MongoServerError && err.code === DUPLICATE_KEY) {
        throw new ValidationError({ 'user.email': 'An account with this email already exists' });
      }
      throw err;
    }
  }

  /**
   * an unknown email, a wrong password, a disabled account and the scheduler all
   * fail the same way, and all count towards the delay on that email
   */
  async login(credentials: LoginRequest): Promise<SessionResponse> {
    const key = throttleKey(credentials.email);
    if (await this.throttle.isBlocked(key)) throw new RateLimitedError();

    const user = await this.users.findByEmail(credentials.email);
    // an unknown email still costs one hash comparison, so it takes as long as a wrong password
    const hash = user ? user.passwordHash : await this.hashForUnknownUser();
    const matches = await bcrypt.compare(credentials.password, hash);

    if (!user || !matches || user.status !== 'active' || user.email === SCHEDULER_EMAIL) {
      await this.recordLoginFailure(key);
      throw new UnauthenticatedError(LOGIN_FAILED);
    }

    const updated = await this.users.recordLogin(user._id, user.passwordHash);
    if (!updated) throw new UnauthenticatedError(LOGIN_FAILED);
    await this.throttle.clear(key);
    return this.sessionResponse(updated);
  }

  private async recordLoginFailure(key: string) {
    const now = Date.now();
    const failures = await this.throttle.recordFailure(
      key,
      new Date(now + LOGIN_FAILURE_MEMORY_MS),
    );
    const delay = loginDelayMs(failures);
    if (delay > 0) await this.throttle.blockUntil(key, new Date(now + delay));
  }

  async getSession(userId: string): Promise<SessionResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError();
    return this.sessionResponse(user);
  }

  /** null for a user who no longer exists or has been disabled */
  async findSessionUser(userId: string): Promise<SessionUser | null> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') return null;
    return {
      id: user._id.toString(),
      role: user.role,
      organisationId: user.organisationId ? user.organisationId.toString() : null,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async updateMe(userId: string, input: UpdateMeRequest): Promise<UserResponse> {
    const user = await this.users.updateProfile(userId, input);
    if (!user) throw new UnauthenticatedError();
    return { user: userView(user) };
  }

  /** signs the user out everywhere except the session that made the change */
  async changePassword(userId: string, input: ChangePasswordRequest, currentSessionId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError();

    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new ValidationError({ currentPassword: 'The current password is not correct' });
    }

    const passwordHash = await hashPassword(input.newPassword);
    await this.users.updatePassword(user._id, passwordHash);
    await this.sessions.deleteForUser(userId, currentSessionId);
  }

  async listUsers(query: ListUsersQuery): Promise<UserListResponse> {
    const users = await this.users.list(query);
    return { items: users.map(userView) };
  }

  /** the temporary password is returned here and nowhere else, and only its hash is stored */
  async createUser(adminId: string, input: CreateUserRequest): Promise<CreateUserResponse> {
    if (input.organisationId) {
      const organisation = await this.organisations.findById(input.organisationId);
      if (!organisation || organisation.type !== input.role) {
        throw new ValidationError({ organisationId: `Choose a ${input.role} organisation` });
      }
    }

    const tempPassword = newTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);

    try {
      const user = await runInTransaction(async (session) => {
        const created = await this.users.create(
          {
            organisationId: input.organisationId ? new Types.ObjectId(input.organisationId) : null,
            role: input.role,
            fullName: input.fullName,
            email: input.email,
            passwordHash,
            phone: input.phone,
            languagePreference: input.languagePreference,
            status: 'active',
            mustChangePassword: true,
          },
          session,
        );
        await this.audit.record(
          adminId,
          'create_user',
          { type: AUDIT_TARGET, id: created._id },
          { session },
        );
        return created;
      });
      return { user: userView(user), tempPassword };
    } catch (err) {
      if (err instanceof mongo.MongoServerError && err.code === DUPLICATE_KEY) {
        throw new ValidationError({ email: 'An account with this email already exists' });
      }
      throw err;
    }
  }

  /** the temporary password appears in this response and nowhere else */
  async resetPassword(adminId: string, userId: string): Promise<ResetPasswordResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError();
    if (userId === adminId) {
      throw new InvalidStateError('Change your own password from your account instead');
    }
    if (user.email === SCHEDULER_EMAIL) {
      throw new InvalidStateError('The scheduler account cannot sign in');
    }
    if (user.status !== 'active') {
      throw new InvalidStateError('Enable the account before resetting its password');
    }

    const tempPassword = newTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);

    const updated = await runInTransaction(async (session) => {
      const changed = await this.users.resetPassword(
        user._id,
        user.passwordHash,
        passwordHash,
        session,
      );
      // another administrator disabled or reset the account first
      if (!changed) throw new InvalidStateError();
      await this.audit.record(
        adminId,
        'reset_password',
        { type: AUDIT_TARGET, id: changed._id },
        { session },
      );
      await this.sessions.deleteForUser(userId, undefined, session);
      await this.throttle.clear(throttleKey(changed.email), session);
      return changed;
    });

    return { user: userView(updated), tempPassword };
  }

  /** a role or status change signs the user out of every browser */
  async updateUser(
    adminId: string,
    userId: string,
    input: UpdateUserRequest,
  ): Promise<UserResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError();

    const role = input.role ?? user.role;
    const status = input.status ?? user.status;

    if (userId === adminId && (role !== 'administrator' || status !== 'active')) {
      throw new InvalidStateError(
        'You cannot disable your own account or remove your own administrator role',
      );
    }
    if (role !== user.role && !(STAFF_ROLES.includes(role) && STAFF_ROLES.includes(user.role))) {
      throw new ValidationError({
        role: 'A role can only change between coordinator and administrator',
      });
    }
    if (role === user.role && status === user.status) return { user: userView(user) };

    const updated = await runInTransaction(async (session) => {
      const changed = await this.users.updateAccess(
        user._id,
        { role: user.role, status: user.status },
        { role, status },
        session,
      );
      // another administrator changed the account first
      if (!changed) throw new InvalidStateError();

      const target = { type: AUDIT_TARGET, id: changed._id };
      if (role !== user.role) {
        await this.audit.record(adminId, 'change_role', target, {
          note: `${user.role} to ${role}`,
          session,
        });
      }
      if (status !== user.status) {
        const action = status === 'disabled' ? 'disable_user' : 'enable_user';
        await this.audit.record(adminId, action, target, { session });
      }
      return changed;
    });

    await this.sessions.deleteForUser(userId);
    return { user: userView(updated) };
  }

  private async sessionResponse(user: Parameters<typeof userView>[0]): Promise<SessionResponse> {
    const organisation = user.organisationId
      ? await this.organisations.findById(user.organisationId)
      : null;
    return {
      user: userView(user),
      organisation: organisation ? organisationView(organisation) : null,
    };
  }

  private newOrganisation(input: RegisterRequest): Partial<OrganisationDoc> {
    const { organisation } = input;
    const suburb = SUBURBS.find((s) => s.name === organisation.suburb)!;
    const base = {
      name: organisation.name,
      type: input.role,
      status: STARTING_STATUS[input.role],
      addressLine: organisation.addressLine,
      suburb: suburb.name,
      city: suburb.city,
      location: suburbLocation(suburb.name),
      contactName: organisation.contactName,
      contactPhone: organisation.contactPhone,
      contactEmail: organisation.contactEmail,
    };

    if (input.role === 'donor') {
      return { ...base, taxReferenceNumber: input.organisation.taxReferenceNumber || null };
    }
    return {
      ...base,
      storageAmbient: input.organisation.storageAmbient,
      storageRefrigerated: input.organisation.storageRefrigerated,
      storageFrozen: input.organisation.storageFrozen,
      maxCapacityKg: input.organisation.maxCapacityKg ?? null,
      hasTransport: input.organisation.hasTransport,
      mealsPerDay: input.organisation.mealsPerDay ?? null,
    };
  }

  private hashForUnknownUser() {
    this.unknownUserHash ??= bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_COST);
    return this.unknownUserHash;
  }
}
