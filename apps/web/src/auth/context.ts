import { createContext, useContext } from 'react';
import type {
  Language,
  LoginRequest,
  Organisation,
  RegisterRequest,
  Role,
  SessionResponse,
  User,
} from '@fedsa/contract';

export type AuthState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: SessionResponse };

export interface AuthContextValue {
  state: AuthState;
  login(body: LoginRequest): Promise<SessionResponse>;
  register(body: RegisterRequest): Promise<SessionResponse>;
  logout(): Promise<void>;
  /** rereads `GET /api/me`, as after a password change */
  refresh(): Promise<void>;
  /** for a request that came back `UNAUTHENTICATED` because the session ran out */
  expire(): void;
  /** saved to the account when signed in, and on this device either way */
  setLanguage(language: Language): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** the session on a screen behind `RequireRole`, where someone is always signed in */
export function useSession(): { user: User; organisation: Organisation | null } {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useSession needs a signed-in user');
  return state.session;
}

export const roleHome: Record<Role, string> = {
  donor: '/donor',
  recipient: '/recipient',
  coordinator: '/coordinator',
  administrator: '/admin',
};

export const CHANGE_PASSWORD_PATH = '/account/password';
