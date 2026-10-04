/* NOTIFICATIONS (ALL ROLES) — CHANNEL BADGE TRACKS DELIVERY COST (PUSH VS BILLED WHATSAPP) */

import { Link } from 'react-router-dom';
import { PageHead, EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { ChannelBadge } from '../components/StatusBadge';
import { useApp, useCurrentUser } from '../store/context';
import { notificationsFor, unreadCount } from '../store/selectors';
import { useT } from '../i18n/useT';
import { formatWhen } from '../lib/format';
import type { NotificationKind } from '../store/types';
import './Notifications.css';

const kindIcon: Record<NotificationKind, IconName> = {
  offer_posted: 'box',
  offer_claimed: 'check',
  claim_released: 'refresh',
  handover_confirmed: 'check-circle',
  driver_dispatched: 'truck',
  verification: 'shield',
  dispute: 'alert',
};

export function Notifications() {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const t = useT();

  const items = notificationsFor(state, user.id);
  const unread = unreadCount(state, user.id);

  return (
    <>
      <PageHead
        title={t('notif.title')}
        lead={unread > 0 ? `${unread} unread` : 'Everything here has been read.'}
        actions={
          unread > 0 ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => dispatch({ type: 'MARK_ALL_READ', userId: user.id })}
            >
              {t('notif.markAll')}
            </button>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState icon="bell" title={t('notif.empty')} />
      ) : (
        <ul className="notif-list">
          {items.map((n) => {
            const body = (
              <>
                <span className="notif__icon" aria-hidden="true">
                  <Icon name={kindIcon[n.kind]} size={20} />
                </span>
                <span className="notif__content">
                  <span className="notif__top">
                    <ChannelBadge channel={n.channel} />
                    <time className="notif__time">{formatWhen(n.createdAt)}</time>
                    {!n.readAt && <span className="notif__dot" aria-hidden="true" />}
                  </span>
                  <strong className="notif__title">{n.title}</strong>
                  <span className="notif__body">{n.body}</span>
                </span>
              </>
            );

            return (
              <li key={n.id} className={`notif${n.readAt ? '' : ' notif--unread'}`}>
                {n.href ? (
                  <Link
                    to={n.href}
                    className="notif__link"
                    onClick={() =>
                      dispatch({ type: 'MARK_NOTIFICATION_READ', notificationId: n.id })
                    }
                  >
                    {body}
                    <Icon name="forward" size={18} className="notif__chev" />
                  </Link>
                ) : (
                  <div className="notif__link">{body}</div>
                )}
                {!n.readAt && <span className="sr-only">Unread</span>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
