/* LIVE COLLECTION-DEADLINE COUNTDOWN, URGENT STATE INSIDE LAST 2H */

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { formatTime, isExpiringSoon, timeLeft } from '../lib/format';

export function Countdown({
  deadline,
  showClock = true,
}: {
  deadline: string;
  showClock?: boolean;
}) {
  const [, tick] = useState(0);

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
        Collection window closed
      </span>
    );
  }

  return (
    <span className={`countdown${urgent ? ' countdown--urgent' : ''}`}>
      <Icon name="clock" size={15} />
      {showClock ? (
        <>
          Collect by {formatTime(deadline)}
          <span className="countdown__left">· {left}</span>
        </>
      ) : (
        left
      )}
    </span>
  );
}
