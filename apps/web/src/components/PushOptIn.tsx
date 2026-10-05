import { useEffect, useState } from 'react';
import { useData } from '../data';
import { useT } from '../i18n/useT';
import {
  currentSubscription,
  pushState,
  readPrompt,
  savePrompt,
  subscribeBrowser,
  type PushState,
} from '../lib/push';
import { errorKey, PendingButton, useToast } from './feedback';
import { Banner } from './ui';

/**
 * with `afterAction`, the offer shown once someone has posted or claimed, never on page load.
 * without it, the on and off switch in the inbox, for a device that has had that offer
 */
export function PushOptIn({ afterAction = false }: { afterAction?: boolean }) {
  const { notifications } = useData();
  const t = useT();
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(readPrompt);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([pushState(), notifications.pushKey()])
      .then(([browser, serverKey]) => {
        if (!current) return;
        setState(browser);
        setKey(serverKey);
      })
      // push stays hidden when either check fails, and nothing else on the screen needs it
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [notifications]);

  const available = key !== null && state !== null && state !== 'unsupported';

  useEffect(() => {
    if (afterAction && available && readPrompt() === null) {
      savePrompt('shown');
    }
  }, [afterAction, available]);

  async function turnOn() {
    if (!key) return;
    setBusy(true);
    try {
      const subscription = await subscribeBrowser(key);
      if (!subscription) {
        setState(Notification.permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      await notifications.subscribePush(subscription);
      setState('on');
      toast.success(t('notif.pushOn'));
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  // the API forgets the phone first. a failure then leaves both sides still subscribed
  async function turnOff() {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await notifications.unsubscribePush({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState('off');
      toast.success(t('push.off'));
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    savePrompt('dismissed');
    setPrompt('dismissed');
  }

  if (!available) return null;

  if (afterAction) {
    if (state !== 'off' || prompt === 'dismissed') return null;
    return (
      <Banner tone="info" title={t('notif.pushOptIn')}>
        <p>{t('push.why')}</p>
        <div className="row row--wrap">
          <PendingButton className="btn btn--primary" pending={busy} onClick={() => void turnOn()}>
            {t('push.turnOn')}
          </PendingButton>
          <button type="button" className="btn btn--ghost" onClick={notNow} disabled={busy}>
            {t('push.notNow')}
          </button>
        </div>
      </Banner>
    );
  }

  if (prompt === null && state !== 'on') return null;
  if (state === 'blocked') return <p className="muted">{t('notif.pushBlocked')}</p>;
  if (state === 'on') {
    return (
      <div className="row row--wrap">
        <span>{t('notif.pushOn')}</span>
        <PendingButton className="btn btn--ghost" pending={busy} onClick={() => void turnOff()}>
          {t('push.turnOff')}
        </PendingButton>
      </div>
    );
  }
  return (
    <PendingButton className="btn btn--secondary" pending={busy} onClick={() => void turnOn()}>
      {t('notif.pushOptIn')}
    </PendingButton>
  );
}
