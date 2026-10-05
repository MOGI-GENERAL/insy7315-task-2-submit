import { useId } from 'react';
import type { Language } from '@fedsa/contract';
import { useAuth } from '../auth/context';
import { languageNames } from '../i18n/strings';
import { useLanguage, useT } from '../i18n/useT';
import { Icon } from './Icon';

/** for the screens outside the app shell, which has its own picker */
export function LanguagePicker() {
  const auth = useAuth();
  const language = useLanguage();
  const t = useT();
  const id = useId();

  return (
    <div className="login__lang">
      <label htmlFor={id}>
        <Icon name="globe" size={18} />
        {t('login.language')}
      </label>
      <select
        id={id}
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
  );
}
