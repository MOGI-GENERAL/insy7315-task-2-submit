import { useState } from 'react';
import { LoginRequest } from '@fedsa/contract';
import type { Language, Role } from '@fedsa/contract';
import { useAuth } from '../auth/context';
import { LogoMark } from '../components/Logo';
import { Icon } from '../components/Icon';
import { PendingButton } from '../components/feedback';
import { Field, FormError, useForm } from '../components/forms';
import { dataMode, demoAccounts, isApiError } from '../data';
import { languageNames } from '../i18n/strings';
import { useLanguage, useT } from '../i18n/useT';
import './Login.css';

const roleLabel: Record<Role, string> = {
  donor: 'Donor',
  recipient: 'Recipient',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
};

export function Login() {
  const auth = useAuth();
  const language = useLanguage();
  const t = useT();
  const [wrongPassword, setWrongPassword] = useState(false);

  const form = useForm({
    initial: { email: '', password: '' },
    schema: LoginRequest,
    async onSubmit(body) {
      setWrongPassword(false);
      try {
        await auth.login(body);
      } catch (error) {
        // one answer for an unknown email and a wrong password. it belongs to no single field
        if (isApiError(error, 'UNAUTHENTICATED')) setWrongPassword(true);
        else throw error;
      }
    },
  });

  function fillDemo(email: string) {
    form.set('email', email);
    form.set('password', 'demo-password');
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
            value={language}
            onChange={(e) => auth.setLanguage(e.target.value as Language)}
          >
            {(Object.keys(languageNames) as Language[]).map((code) => (
              <option key={code} value={code}>
                {languageNames[code]}
              </option>
            ))}
          </select>
        </div>

        <form className="login__form" {...form.formProps}>
          <h1 className="login__subtitle">{t('login.subtitle')}</h1>
          <FormError form={form} />
          {wrongPassword && (
            <div className="banner" data-tone="bad" role="alert">
              <Icon name="alert" size={20} />
              <div className="banner__body">{t('login.failed')}</div>
            </div>
          )}
          <Field form={form} name="email" label={t('login.email')}>
            {(props) => (
              <input {...props} className="input" type="email" autoComplete="username" />
            )}
          </Field>
          <Field form={form} name="password" label={t('login.password')}>
            {(props) => (
              <input
                {...props}
                className="input"
                type="password"
                autoComplete="current-password"
              />
            )}
          </Field>
          <PendingButton
            type="submit"
            className="btn btn--primary btn--block btn--lg"
            pending={form.pending}
            pendingLabel={t('login.signingIn')}
          >
            {t('login.signIn')}
          </PendingButton>
          <p className="login__help">{t('login.forgot')}</p>
        </form>

        {dataMode() === 'fake' && (
          <section aria-labelledby="demo-accounts">
            <h2 className="login__subtitle" id="demo-accounts">
              {t('login.demoAccounts')}
            </h2>
            <p className="login__demo">
              <Icon name="shield" size={16} />
              {t('login.demoNote')}
            </p>
            <ul className="login__list">
              {demoAccounts.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    className="login__card"
                    onClick={() => fillDemo(account.email)}
                  >
                    <span className="login__card-top">
                      <span className="login__who">
                        <strong>{account.name}</strong>
                        <span className="login__job">{account.email}</span>
                      </span>
                      <span className="badge login__role">{roleLabel[account.role]}</span>
                    </span>
                    <span className="login__note">{account.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
