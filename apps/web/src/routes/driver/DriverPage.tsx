import { useEffect, useId } from 'react';
import { useParams } from 'react-router-dom';
import { DriverToken, type Language } from '@fedsa/contract';
import { LogoMark } from '../../components/Logo';
import { Icon } from '../../components/Icon';
import { ApiError } from '../../data/ApiError';
import { useData } from '../../data/context';
import { useLoad } from '../../data/useLoad';
import { browserLanguage } from '../../i18n/browserLanguage';
import { LANGUAGE_STORAGE_KEY, useLanguageContext } from '../../i18n/context';
import { languageNames } from '../../i18n/strings';
import { fill } from '../../i18n/useFormat';
import { useT } from '../../i18n/useT';
import { DriverView } from './DriverView';
import { driverState, type DriverState } from './state';
import './Driver.css';

/** there is no session, and the choice stays on the device */
function LanguageSelect() {
  const { language, setLanguage } = useLanguageContext();
  const t = useT();
  const id = useId();
  return (
    <div className="driver__lang">
      <label htmlFor={id}>
        <Icon name="globe" size={18} />
        {t('login.language')}
      </label>
      <select
        id={id}
        className="select"
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
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

/** the service worker serves the shell without the server's headers */
function useKeepPrivate() {
  useEffect(() => {
    const tags = [
      ['referrer', 'no-referrer'],
      ['robots', 'noindex'],
    ].map(([name, content]) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.append(meta);
      return meta;
    });
    return () => tags.forEach((meta) => meta.remove());
  }, []);
}

function useBrowserLanguage() {
  const { setLanguage } = useLanguageContext();
  useEffect(() => {
    try {
      if (localStorage.getItem(LANGUAGE_STORAGE_KEY) !== null) return;
    } catch {
      // storage refused, which leaves no earlier choice to respect
    }
    const preferred = browserLanguage();
    if (preferred !== 'en') setLanguage(preferred, false);
  }, [setLanguage]);
}

function useTitle(state: DriverState) {
  const t = useT();
  const title =
    state.kind === 'ready'
      ? fill(t('driver.reference'), { reference: state.data.reference })
      : state.kind === 'gone'
        ? t('driver.goneTitle')
        : state.kind === 'failed'
          ? t('driver.failed')
          : 'FEDSA';
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}

/** opened from the link in the driver's text, outside the app shell and the sign-in */
export function DriverPage() {
  const { token = '' } = useParams();
  const { driver } = useData();
  useKeepPrivate();
  useBrowserLanguage();

  const result = useLoad(
    () =>
      DriverToken.safeParse(token).success
        ? driver.collection(token)
        : Promise.reject(new ApiError('NOT_FOUND', 'Not found.')),
    [driver, token],
  );

  const state = driverState(result);
  useTitle(state);

  return (
    <div className="driver">
      <header className="driver__top">
        <LogoMark size={36} title="FEDSA" />
        <LanguageSelect />
      </header>
      <main id="main" className="driver__main">
        <DriverView state={state} onRetry={() => void result.reload()} />
      </main>
    </div>
  );
}
