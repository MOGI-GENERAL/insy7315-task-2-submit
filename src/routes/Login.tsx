/* LOGIN — PERSONA PICKER (DEMO STAND-IN FOR AUTH); LANGUAGE SELECT KEPT OFF SETTINGS ON PURPOSE */

import { useNavigate } from 'react-router-dom';
import { LogoMark } from '../components/Logo';
import { Icon } from '../components/Icon';
import { useApp } from '../store/context';
import { loginPersonaIds } from '../store/seed';
import { languageNames } from '../i18n/strings';
import { useT } from '../i18n/useT';
import type { Language, Role } from '../store/types';
import './Login.css';

const roleLabel: Record<Role, string> = {
  donor: 'Donor',
  recipient: 'Recipient',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
};

const roleHome: Record<Role, string> = {
  donor: '/donor',
  recipient: '/recipient',
  coordinator: '/coordinator',
  administrator: '/admin',
};

export function Login() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const t = useT();

  const personas = loginPersonaIds
    .map((id) => state.users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  function signIn(userId: string, role: Role) {
    dispatch({ type: 'LOGIN', userId });
    navigate(roleHome[role]);
  }

  return (
    <div className="login">
      <div className="login__inner">
        <header className="login__head">
          <span className="login__logo">
            <LogoMark size={56} />
          </span>
          <img className="login__wordmark" src="/FEDSA-word-mark.svg" alt="FEDSA" />
        </header>

        <div className="login__lang">
          <label htmlFor="login-language">
            <Icon name="globe" size={18} />
            {t('login.language')}
          </label>
          <select
            id="login-language"
            className="select"
            value={state.language}
            onChange={(e) =>
              dispatch({ type: 'SET_LANGUAGE', language: e.target.value as Language })
            }
          >
            {(Object.keys(languageNames) as Language[]).map((code) => (
              <option key={code} value={code}>
                {languageNames[code]}
              </option>
            ))}
          </select>
        </div>

        <h2 className="login__subtitle">{t('login.subtitle')}</h2>

        <ul className="login__list">
          {personas.map((user) => {
            const org = state.organisations.find((o) => o.id === user.organisationId);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  className="login__card"
                  onClick={() => signIn(user.id, user.role)}
                >
                  <span className="login__card-top">
                    <span className="login__avatar" aria-hidden="true">
                      {user.name
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                    <span className="login__who">
                      <strong>{user.name}</strong>
                      <span className="login__job">{user.jobTitle}</span>
                    </span>
                    <span className="badge login__role">{roleLabel[user.role]}</span>
                  </span>
                  {user.personaNote && <span className="login__note">{user.personaNote}</span>}
                  {org && (
                    <span className="login__org">
                      <Icon name="pin" size={14} />
                      {org.suburb}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="login__demo">
          <Icon name="shield" size={16} />
          {t('login.demoNote')}
        </p>
      </div>
    </div>
  );
}
