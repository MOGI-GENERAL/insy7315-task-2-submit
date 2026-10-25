import { randomBytes } from 'node:crypto';
import type { UserRepository } from '../db/index.js';
import { hashPassword } from './user-service.js';

export const SCHEDULER_EMAIL = 'scheduler@fedsa.invalid';

const DUPLICATE_KEY = 11000;

/** stays disabled and nobody knows its password. it only gives the audit log an administrator to name */
export async function findOrCreateScheduler(users: UserRepository) {
  const existing = await users.findByEmail(SCHEDULER_EMAIL);
  if (existing) return existing;

  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
  try {
    return await users.create({
      fullName: 'FEDSA scheduler',
      email: SCHEDULER_EMAIL,
      role: 'administrator',
      status: 'disabled',
      organisationId: null,
      mustChangePassword: false,
      languagePreference: 'en',
      phone: '+27000000000',
      passwordHash,
    });
  } catch (err) {
    // another run created it between our read and our write
    if ((err as { code?: number }).code !== DUPLICATE_KEY) throw err;
    const created = await users.findByEmail(SCHEDULER_EMAIL);
    if (!created) throw err;
    return created;
  }
}
