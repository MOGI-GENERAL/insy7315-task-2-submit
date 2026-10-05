import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/context';
import { Icon } from '../../components/Icon';
import { LanguagePicker } from '../../components/LanguagePicker';
import { LogoMark } from '../../components/Logo';
import type { StringKey } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { REGISTER_PATH } from './paths';
import '../Login.css';
import './Account.css';

const SECTIONS: [StringKey, StringKey][] = [
  ['privacy.whatTitle', 'privacy.what'],
  ['privacy.whyTitle', 'privacy.why'],
  ['privacy.photosTitle', 'privacy.photos'],
  ['privacy.peopleTitle', 'privacy.people'],
  ['privacy.sharingTitle', 'privacy.sharing'],
  ['privacy.keepTitle', 'privacy.keep'],
  ['privacy.rightsTitle', 'privacy.rights'],
];

/** readable signed in or out, since registration links here before an account exists */
export function PrivacyNotice() {
  const { state } = useAuth();
  const t = useT();
  const signedIn = state.status === 'signedIn';

  return (
    <div className="login">
      <div className="login__inner">
        <header className="login__head">
          <span className="login__logo">
            <LogoMark size={56} />
          </span>
          <img className="login__wordmark" src="/FEDSA-word-mark.svg" alt="FEDSA" />
        </header>

        <LanguagePicker />

        <article className="privacy">
          <h1>{t('privacy.title')}</h1>
          <p>{t('privacy.intro')}</p>
          {SECTIONS.map(([title, body]) => (
            <section key={title}>
              <h2>{t(title)}</h2>
              <p>{t(body)}</p>
            </section>
          ))}
        </article>

        <Link to={signedIn ? '/' : REGISTER_PATH} className="btn btn--secondary">
          <Icon name="back" size={18} />
          {t('common.back')}
        </Link>
      </div>
    </div>
  );
}
