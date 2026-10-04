import { z } from 'zod';
import { e164Phone, email, shortText } from './common.js';
import { Organisation, User } from './entities.js';
import { Language } from './enums.js';
import { Suburb } from './suburbs.js';

/** bcrypt ignores everything past 72 bytes */
export const password = z.string().min(10, 'Use at least 10 characters').max(72);

export const HealthResponse = z.object({
  ok: z.boolean(),
  version: z.string(),
  db: z.enum(['up', 'down']).optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const CsrfResponse = z.object({ csrfToken: z.string() });
export type CsrfResponse = z.infer<typeof CsrfResponse>;

const OrganisationProfileInput = z.object({
  name: shortText,
  addressLine: shortText,
  suburb: Suburb,
  contactName: shortText,
  contactPhone: e164Phone,
  contactEmail: email,
});

export const DonorOrganisationInput = OrganisationProfileInput.extend({
  taxReferenceNumber: z.string().trim().max(40).optional(),
});
export type DonorOrganisationInput = z.infer<typeof DonorOrganisationInput>;

export const RecipientOrganisationInput = OrganisationProfileInput.extend({
  storageAmbient: z.boolean(),
  storageRefrigerated: z.boolean(),
  storageFrozen: z.boolean(),
  maxCapacityKg: z.number().positive().max(5000).optional(),
  hasTransport: z.boolean(),
  mealsPerDay: z.number().int().positive().max(100000).optional(),
});
export type RecipientOrganisationInput = z.infer<typeof RecipientOrganisationInput>;

const RegisterUser = z.object({
  fullName: shortText,
  email,
  password,
  phone: e164Phone,
  languagePreference: Language,
});

const consent = z.literal(true, 'Consent is required to register');

export const RegisterRequest = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('donor'),
    organisation: DonorOrganisationInput,
    user: RegisterUser,
    consent,
  }),
  z.object({
    role: z.literal('recipient'),
    organisation: RecipientOrganisationInput,
    user: RegisterUser,
    consent,
  }),
]);
export type RegisterRequest = z.infer<typeof RegisterRequest>;

/** no password policy here, since a 400 for a short password would break the uniform 401 */
export const LoginRequest = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** returned by register, login and `GET /api/me`. `organisation` is null for FEDSA staff */
export const SessionResponse = z.object({
  user: User,
  organisation: Organisation.nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const UpdateMeRequest = z.object({
  languagePreference: Language.optional(),
  phone: e164Phone.optional(),
});
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

export const UserResponse = z.object({ user: User });
export type UserResponse = z.infer<typeof UserResponse>;

export const ChangePasswordRequest = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: password })
  .refine((b) => b.newPassword !== b.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a different password',
  });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

/** the browser's `PushSubscription.toJSON()` */
export const PushSubscriptionRequest = z.object({
  endpoint: z.url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequest>;

export const DeletePushSubscriptionRequest = z.object({ endpoint: z.url().max(2000) });
export type DeletePushSubscriptionRequest = z.infer<typeof DeletePushSubscriptionRequest>;

export const VapidKeyResponse = z.object({ vapidPublicKey: z.string() });
export type VapidKeyResponse = z.infer<typeof VapidKeyResponse>;
