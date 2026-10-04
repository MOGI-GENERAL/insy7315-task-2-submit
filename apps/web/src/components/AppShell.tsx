/* APP SHELL: bottom nav < 64rem, sidebar >= 64rem, shared header */

import { NavLink, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { LogoMark } from './Logo';
import type { Language, Role } from '@fedsa/contract';
import { useAuth, useSession } from '../auth/context';
import { useAppState } from '../store/context';
import { unreadCount } from '../store/selectors';
import { useLanguage, useT } from '../i18n/useT';
import { languageNames } from '../i18n/strings';
import type { StringKey } from '../i18n/strings';
import { CHANGE_PASSWORD_PATH } from '../auth/context';
import './AppShell.css';

interface NavItem {
  to: string;
  label: StringKey;
  icon: IconName;
  end?: boolean;
}

const navByRole: Record<Role, NavItem[]> = {
  donor: [
    { to: '/donor', label: 'nav.home', icon: 'home', end: true },
    { to: '/donor/post', label: 'nav.post', icon: 'plus' },
    { to: '/donor/certificates', label: 'nav.tax', icon: 'file' },
  ],
  recipient: [
    { to: '/recipient', label: 'nav.offers', icon: 'list', end: true },
    { to: '/recipient/claims', label: 'nav.myClaims', icon: 'check-circle' },
    { to: '/recipient/scheduled', label: 'nav.scheduled', icon: 'clock' },
    { to: '/recipient/profile', label: 'nav.profile', icon: 'pin' },
  ],
  coordinator: [
    { to: '/coordinator', label: 'nav.board', icon: 'home', end: true },
    { to: '/coordinator/dispatch', label: 'nav.dispatch', icon: 'truck' },
    { to: '/coordinator/verify', label: 'nav.verify', icon: 'shield' },
    { to: '/coordinator/organisations', label: 'nav.notes', icon: 'people' },
    { to: '/coordinator/disputes', label: 'nav.disputes', icon: 'alert' },
  ],
  administrator: [
    { to: '/admin', label: 'nav.reports', icon: 'chart', end: true },
    { to: '/admin/certificates', label: 'nav.tax', icon: 'file' },
    { to: '/admin/accounts', label: 'nav.accounts', icon: 'people' },
  ],
};

const roleLabel: Record<Role, StringKey> = {
  donor: 'role.donor',
  recipient: 'role.recipient',
  coordinator: 'role.coordinator',
  administrator: 'role.administrator',
};

export function AppShell({ children }: { children: ReactNode }) {
  const state = useAppState();
  const { user, organisation: org } = useSession();
  const { logout, setLanguage } = useAuth();
  const language = useLanguage();
  const t = useT();
  const location = useLocation();

  // BrowserRouter keeps the old scroll position, which opens a new screen halfway down
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const items = navByRole[user.role];
  // TODO: read from the notifications repository once the inbox is wired
  const unread = unreadCount(state, user.id);

  return (
    <div className="shell" data-role={user.role}>
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>

      <header className="shell__header">
        <Link to={`/${user.role === 'administrator' ? 'admin' : user.role}`} className="shell__brand">
          <LogoMark size={32} />
          <span className="shell__brand-text">
            <small>{org?.name ?? t(roleLabel[user.role])}</small>
          </span>
        </Link>

        <div className="shell__header-actions">
          <label className="shell__lang">
            <Icon name="globe" size={18} />
            <span className="sr-only">{t('login.language')}</span>
            <select
              className="shell__lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              {(Object.keys(languageNames) as Language[]).map((code) => (
                <option key={code} value={code}>
                  {languageNames[code]}
                </option>
              ))}
            </select>
          </label>

          <NavLink
            to="/notifications"
            className="shell__bell"
            aria-label={`${t('nav.notifications')}${unread > 0 ? `, ${unread} ${t('nav.unread')}` : ''}`}
          >
            <Icon name="bell" size={20} />
            {unread > 0 && <span className="shell__badge">{unread}</span>}
          </NavLink>

          <NavLink
            to={CHANGE_PASSWORD_PATH}
            className="shell__signout"
            aria-label={t('nav.account')}
          >
            <Icon name="shield" size={18} />
            <span className="shell__signout-text">{t('nav.account')}</span>
          </NavLink>

          <button
            type="button"
            className="shell__signout"
            aria-label={t('nav.signOut')}
            onClick={() => void logout()}
          >
            <Icon name="signout" size={18} />
            <span className="shell__signout-text">{t('nav.signOut')}</span>
          </button>
        </div>
      </header>

      <div className="shell__frame">
        <nav className="shell__nav" aria-label={t('nav.sections')}>
          <p className="shell__nav-who">
            <span className="shell__nav-role">{t(roleLabel[user.role])}</span>
            <span className="shell__nav-name">{user.fullName}</span>
          </p>
          <ul>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className="shell__nav-link">
                  <Icon name={item.icon} size={22} />
                  <span>{t(item.label)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="shell__main" key={location.pathname}>
          <div className="shell__main-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
