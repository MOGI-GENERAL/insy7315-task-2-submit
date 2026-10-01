/* APP SHELL: bottom nav < 64rem, sidebar >= 64rem, shared header */

import { NavLink, Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { LogoMark } from './Logo';
import { useApp, useCurrentUser } from '../store/context';
import { unreadCount } from '../store/selectors';
import { useT } from '../i18n/useT';
import { languageNames } from '../i18n/strings';
import type { Language, Role } from '../store/types';
import './AppShell.css';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const navByRole: Record<Role, NavItem[]> = {
  donor: [
    { to: '/donor', label: 'Home', icon: 'home', end: true },
    { to: '/donor/post', label: 'Post', icon: 'plus' },
    { to: '/donor/certificates', label: 'Tax', icon: 'file' },
  ],
  recipient: [
    { to: '/recipient', label: 'Offers', icon: 'list', end: true },
    { to: '/recipient/claims', label: 'My claims', icon: 'check-circle' },
    { to: '/recipient/scheduled', label: 'Scheduled', icon: 'clock' },
    { to: '/recipient/profile', label: 'Profile', icon: 'pin' },
  ],
  coordinator: [
    { to: '/coordinator', label: 'Board', icon: 'home', end: true },
    { to: '/coordinator/dispatch', label: 'Dispatch', icon: 'truck' },
    { to: '/coordinator/verify', label: 'Verify', icon: 'shield' },
    { to: '/coordinator/organisations', label: 'Notes', icon: 'people' },
    { to: '/coordinator/disputes', label: 'Disputes', icon: 'alert' },
  ],
  administrator: [
    { to: '/admin', label: 'Reports', icon: 'chart', end: true },
    { to: '/admin/certificates', label: 'Tax', icon: 'file' },
    { to: '/admin/accounts', label: 'Accounts', icon: 'people' },
  ],
};

const roleLabel: Record<Role, string> = {
  donor: 'Donor',
  recipient: 'Recipient',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useApp();
  const user = useCurrentUser();
  const t = useT();
  const location = useLocation();

  if (!user) return null;

  const items = navByRole[user.role];
  const unread = unreadCount(state, user.id);
  const org = state.organisations.find((o) => o.id === user.organisationId);

  return (
    <div className="shell" data-role={user.role}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="shell__header">
        <Link to={`/${user.role === 'administrator' ? 'admin' : user.role}`} className="shell__brand">
          <LogoMark size={32} />
          <span className="shell__brand-text">
            <small>{org?.name ?? roleLabel[user.role]}</small>
          </span>
        </Link>

        <div className="shell__header-actions">
          <label className="shell__lang">
            <Icon name="globe" size={18} />
            <span className="sr-only">{t('login.language')}</span>
            <select
              className="shell__lang-select"
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
          </label>

          <NavLink
            to="/notifications"
            className="shell__bell"
            aria-label={`${t('nav.notifications')}${unread > 0 ? `, ${unread} unread` : ''}`}
          >
            <Icon name="bell" size={20} />
            {unread > 0 && <span className="shell__badge">{unread}</span>}
          </NavLink>

          <button
            type="button"
            className="shell__signout"
            onClick={() => dispatch({ type: 'LOGOUT' })}
          >
            <Icon name="signout" size={18} />
            <span className="shell__signout-text">{t('nav.signOut')}</span>
          </button>
        </div>
      </header>

      <div className="shell__frame">
        <nav className="shell__nav" aria-label={`${roleLabel[user.role]} sections`}>
          <p className="shell__nav-who">
            <span className="shell__nav-role">{roleLabel[user.role]}</span>
            <span className="shell__nav-name">{user.name}</span>
          </p>
          <ul>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className="shell__nav-link">
                  <Icon name={item.icon} size={22} />
                  <span>{item.label}</span>
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
