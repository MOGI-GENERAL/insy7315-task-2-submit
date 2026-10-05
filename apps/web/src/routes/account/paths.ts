import type { SessionResponse } from '@fedsa/contract';
import { roleHome } from '../../auth/context';

export const REGISTER_PATH = '/register';
export const PRIVACY_PATH = '/privacy';
export const PENDING_PATH = '/recipient/pending';

/** a recipient cannot claim until a coordinator verifies it, so it lands on the waiting screen */
export function homeAfterRegistering({ user, organisation }: SessionResponse): string {
  if (organisation?.type === 'recipient' && organisation.status === 'pending') return PENDING_PATH;
  return roleHome[user.role];
}
