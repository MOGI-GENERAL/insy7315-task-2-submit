import { z } from 'zod';
import { e164Phone, email, isoDay, objectId, shortText } from './common.js';
import { AuditEntry, User } from './entities.js';
import { AuditAction, Language, Role, UserStatus } from './enums.js';

export const ListUsersQuery = z.object({
  role: Role.optional(),
  status: UserStatus.optional(),
  q: z.string().trim().max(120).optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuery>;

export const UserListResponse = z.object({ items: z.array(User) });
export type UserListResponse = z.infer<typeof UserListResponse>;

/** donor and recipient accounts need an organisation, FEDSA staff have none */
export const CreateUserRequest = z
  .object({
    fullName: shortText,
    email,
    role: Role,
    organisationId: objectId.optional(),
    phone: e164Phone,
    languagePreference: Language,
  })
  .refine((b) => (b.role === 'donor' || b.role === 'recipient') === !!b.organisationId, {
    path: ['organisationId'],
    message: 'Required for donor and recipient accounts, and only for them',
  });
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

/** `tempPassword` is shown once and must be changed at first login */
export const CreateUserResponse = z.object({ user: User, tempPassword: z.string() });
export type CreateUserResponse = z.infer<typeof CreateUserResponse>;

export const UpdateUserRequest = z
  .object({ role: Role.optional(), status: UserStatus.optional() })
  .refine((b) => b.role !== undefined || b.status !== undefined, 'Change the role or the status');
export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;

export const AuditLogQuery = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  action: AuditAction.optional(),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuery>;

export const AuditLogResponse = z.object({ items: z.array(AuditEntry) });
export type AuditLogResponse = z.infer<typeof AuditLogResponse>;
