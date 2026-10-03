import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n/useT';
import { Icon } from '../Icon';
import { PendingButton } from './PendingButton';

/**
 * native modal `<dialog>`, which makes the page behind it inert and restores focus on close.
 * focus starts on cancel. Enter must not confirm a destructive action by accident
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'go' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function cancel() {
    if (!busy) onCancel();
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      onCancel={(e) => {
        // Esc closes the dialog natively. the parent's `open` decides instead
        e.preventDefault();
        cancel();
      }}
      onClose={() => {
        // Chrome ignores preventDefault on a second Esc and closes anyway
        if (!openRef.current) return;
        if (busy) ref.current?.showModal();
        else onCancel();
      }}
    >
      <div className="dialog__body">
        <div className="row row--between dialog__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="dialog__close" onClick={cancel} disabled={busy}>
            <Icon name="close" size={20} title={t('common.close')} />
          </button>
        </div>
        {children && (
          <div className="dialog__content" id={bodyId}>
            {children}
          </div>
        )}
        <div className="dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn--secondary"
            onClick={cancel}
            disabled={busy}
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <PendingButton className={`btn btn--${tone}`} pending={busy} onClick={onConfirm}>
            {confirmLabel}
          </PendingButton>
        </div>
      </div>
    </dialog>
  );
}
