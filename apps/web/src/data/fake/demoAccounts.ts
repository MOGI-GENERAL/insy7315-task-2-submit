import type { Role } from '@fedsa/contract';
import { loginPersonaIds, organisations, users } from '../../store/seed';
import { fakeEmail } from './mappers';

export interface DemoAccount {
  email: string;
  name: string;
  role: Role;
  organisation: string | null;
  note: string;
}

/** the seed's personas. the sign-in screen lists them in fake mode only */
export const demoAccounts: DemoAccount[] = loginPersonaIds.flatMap((id) => {
  const user = users.find((u) => u.id === id);
  if (!user) return [];
  const org = organisations.find((o) => o.id === user.organisationId);
  return [
    {
      email: fakeEmail(user),
      name: user.name,
      role: user.role,
      organisation: org?.name ?? null,
      note: user.personaNote,
    },
  ];
});
