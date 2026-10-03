import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n/useT';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { ToastContext, addToast, autoDismissMs, removeToast } from './toasts';
import type { Toast, ToastApi, ToastTone } from './toasts';

const icon: Record<ToastTone, IconName> = { good: 'check-circle', bad: 'alert', info: 'bell' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((all) => removeToast(all, id)), []);

  const api = useMemo<ToastApi>(() => {
    const show = (tone: ToastTone) => (message: string) =>
      setToasts((all) => addToast(all, { id: ++nextId.current, tone, message }));
    return { success: show('good'), error: show('bad'), info: show('info') };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* always mounted. screen readers ignore a live region that arrives with its text */}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const t = useT();

  useEffect(() => {
    const ms = autoDismissMs(toast.tone);
    if (ms === null) return;
    const timer = setTimeout(() => onDismiss(toast.id), ms);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="toast" data-tone={toast.tone}>
      <Icon name={icon[toast.tone]} size={20} />
      <p className="toast__message">{toast.message}</p>
      <button type="button" className="toast__close" onClick={() => onDismiss(toast.id)}>
        <Icon name="close" size={18} title={t('feedback.dismiss')} />
      </button>
    </div>
  );
}
