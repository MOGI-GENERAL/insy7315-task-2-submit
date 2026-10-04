import { randomBytes } from 'node:crypto';
import {
  SUBURBS,
  suburbLocation,
  type ChangePasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type Role,
  type SessionResponse,
  type UpdateMeRequest,
  type UserResponse,
} from '@fedsa/contract';
import bcrypt from 'bcryptjs';
import { mongo } from 'mongoose';
import {
  runInTransaction,
  type OrganisationDoc,
  type OrganisationRepository,
  type SessionRepository,
  type UserRepository,
} from '../db/index.js';
import { UnauthenticatedError, ValidationError } from '../errors.js';
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

/** what the guards need, read from the database on every request */
export interface SessionUser {
  id: string;
  role: Role;
  organisationId: string | null;
}

export class UserService {
  private readonly users: UserRepository;
  private readonly organisations: OrganisationRepository;
  private readonly sessions: SessionRepository;
  private unknownUserHash: Promise<string> | undefined;

  constructor(
    users: UserRepository,
    organisations: OrganisationRepository,
    sessions: SessionRepository,
  ) {
    this.users = users;
    this.organisations = organisations;
    this.sessions = sessions;
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

  /** an unknown email, a wrong password and a disabled account all fail the same way */
  async login(credentials: LoginRequest): Promise<SessionResponse> {
    const user = await this.users.findByEmail(credentials.email);
    // an unknown email still costs one hash comparison, so it takes as long as a wrong password
    const hash = user ? user.passwordHash : await this.hashForUnknownUser();
    const matches = await bcrypt.compare(credentials.password, hash);

    if (!user || !matches || user.status !== 'active') {
      throw new UnauthenticatedError(LOGIN_FAILED);
    }

    const updated = await this.users.recordLogin(user._id);
    if (!updated) throw new UnauthenticatedError(LOGIN_FAILED);
    return this.sessionResponse(updated);
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
