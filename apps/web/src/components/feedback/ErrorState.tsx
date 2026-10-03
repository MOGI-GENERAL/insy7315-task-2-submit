import { useState } from 'react';
import { useAuth } from '../../auth/context';
import { isApiError } from '../../data/ApiError';
import { useT } from '../../i18n/useT';
import { Icon } from '../Icon';
import { PendingButton } from './PendingButton';
import { errorKey } from './errorKey';

/** a load that failed. `retry` reruns it, and a lapsed session offers sign-in instead */
export function ErrorState({
  error,
  retry,
  title,
}: {
  error: unknown;
  retry?: () => unknown;
  title?: string;
}) {
  const t = useT();
  const { expire } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const signedOut = isApiError(error, 'UNAUTHENTICATED');

  async function onRetry() {
    setRetrying(true);
    try {
      await retry?.();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="error-state" role="alert">
      <Icon name="alert" size={32} />
      <h3>{title ?? t('feedback.errorTitle')}</h3>
      <p>{t(errorKey(error))}</p>
      {signedOut ? (
        <button type="button" className="btn btn--primary" onClick={expire}>
          {t('feedback.signInAgain')}
        </button>
      ) : (
        retry && (
          <PendingButton className="btn btn--secondary" pending={retrying} onClick={onRetry}>
            <Icon name="refresh" size={18} />
            {t('feedback.retry')}
          </PendingButton>
        )
      )}
    </div>
  );
}
