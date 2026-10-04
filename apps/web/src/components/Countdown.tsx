/* LIVE COLLECTION-DEADLINE COUNTDOWN, URGENT STATE INSIDE LAST 2H */

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { isExpiringSoon } from '../lib/format';
import { useFormat } from '../i18n/useFormat';
import { useT } from '../i18n/useT';

export function Countdown({
  deadline,
  showClock = true,
}: {
  deadline: string;
  showClock?: boolean;
}) {
  const [, tick] = useState(0);
  const t = useT();
  const { time, timeLeft } = useFormat();

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const left = timeLeft(deadline);
  const urgent = isExpiringSoon(deadline);

  if (!left) {
    return (
      <span className="countdown countdown--past">
        <Icon name="clock" size={15} />
        {t('offer.expired')}
      </span>
    );
  }

  return (
    <span className={`countdown${urgent ? ' countdown--urgent' : ''}`}>
      <Icon name="clock" size={15} />
      {showClock ? (
        <>
          {t('offer.collectBy')} {time(deadline)}
          <span className="countdown__left">· {left}</span>
        </>
      ) : (
        left
      )}
    </span>
  );
}
