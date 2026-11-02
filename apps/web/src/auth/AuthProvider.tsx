import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Language, SessionResponse } from '@fedsa/contract';
import { useData } from '../data/context';
import { useLanguageContext } from '../i18n/context';
import { existingSubscription } from '../lib/push';
import { AuthContext } from './context';
import type { AuthContextValue, AuthState } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, notifications } = useData();
  const { setLanguage: setLocalLanguage } = useLanguageContext();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const signIn = useCallback(
    (session: SessionResponse) => {
      setLocalLanguage(session.user.languagePreference);
      setState({ status: 'signedIn', session });
      return session;
    },
    [setLocalLanguage],
  );

  // a reset or an access change clears the account's subscriptions on the server
  const resubscribePush = useCallback(
    (session: SessionResponse) => {
      existingSubscription()
        .then((subscription) => subscription && notifications.subscribePush(subscription))
        .catch(() => {});
      return session;
    },
    [notifications],
  );

  const refresh = useCallback(
    () =>
      auth.me().then(
        (session) => {
          if (session) signIn(session);
          else setState({ status: 'signedOut' });
        },
        (error: unknown) => setState({ status: 'error', error }),
      ),
    [auth, signIn],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signedIn = state.status === 'signedIn';

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      refresh,
      login: (body) => auth.login(body).then(resubscribePush).then(signIn),
      register: (body) => auth.register(body).then(resubscribePush).then(signIn),
      async logout() {
        // before the call. screens still on the fake store's user must unmount before it clears
        setState({ status: 'signedOut' });
        await auth.logout().catch(() => {});
      },
      expire: () => setState({ status: 'signedOut' }),
      setLanguage(language: Language) {
        setLocalLanguage(language);
        // a failed save is silent. the device still remembers the choice
        if (signedIn) auth.updateMe({ languagePreference: language }).catch(() => {});
      },
    }),
    [state, signedIn, refresh, auth, signIn, resubscribePush, setLocalLanguage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
