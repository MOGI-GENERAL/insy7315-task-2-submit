import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Notification, NotificationKind } from '@fedsa/contract';
import { useData, useLoad } from '../data';
import { Empty, errorKey, LoadState, PendingButton, useToast } from '../components/feedback';
import { PageHead } from '../components/ui';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { useT } from '../i18n/useT';
import { fill, useFormat } from '../i18n/useFormat';
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
  const { notifications } = useData();
  const t = useT();
  const format = useFormat();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [marking, setMarking] = useState<string | null>(null);

  const inbox = useLoad(() => notifications.list(), [notifications]);

  /** any navigation, even to this same page, makes the shell reread its unread count */
  async function open(n: Notification) {
    setMarking(n.id);
    try {
      await notifications.markRead(n.id);
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setMarking(null);
    }
    if (n.href) {
      navigate(n.href);
    } else {
      navigate(location.pathname, { replace: true });
      await inbox.reload();
    }
  }

  const unread = inbox.data?.unread;

  return (
    <>
      <PageHead
        title={t('notif.title')}
        lead={
          unread === undefined
            ? undefined
            : unread > 0
              ? fill(t('notif.unreadCount'), { count: unread })
              : t('notif.allRead')
        }
      />

      <LoadState result={inbox}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty icon="bell" title={t('notif.empty')} />
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const isUnread = !n.readAt;
                const body = (
                  <>
                    <span className="notif__icon" aria-hidden="true">
                      <Icon name={kindIcon[n.kind]} size={20} />
                    </span>
                    <span className="notif__content">
                      <span className="notif__top">
                        <time className="notif__time" dateTime={n.createdAt}>
                          {format.when(n.createdAt)}
                        </time>
                        {isUnread && <span className="notif__dot" aria-hidden="true" />}
                      </span>
                      <strong className="notif__title">{n.title}</strong>
                      <span className="notif__body">{n.body}</span>
                      {isUnread && <span className="sr-only">{t('notif.unread')}</span>}
                    </span>
                  </>
                );

                return (
                  <li key={n.id} className={`notif${isUnread ? ' notif--unread' : ''}`}>
                    {n.href ? (
                      <Link
                        to={n.href}
                        className="notif__link"
                        onClick={(e) => {
                          if (!isUnread) return;
                          e.preventDefault();
                          if (!marking) void open(n);
                        }}
                      >
                        {body}
                        <Icon name="forward" size={18} className="notif__chev" />
                      </Link>
                    ) : (
                      <div className="notif__link">
                        {body}
                        {isUnread && (
                          <PendingButton
                            className="btn btn--ghost"
                            pending={marking === n.id}
                            onClick={() => void open(n)}
                          >
                            {t('notif.markRead')}
                          </PendingButton>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        }
      </LoadState>
    </>
  );
}
