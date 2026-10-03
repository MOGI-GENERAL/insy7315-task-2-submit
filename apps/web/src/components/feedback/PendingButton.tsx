import type { ButtonHTMLAttributes } from 'react';

/**
 * stays focusable while pending so keyboard and screen reader users keep their place.
 * clicks are dropped instead
 */
export function PendingButton({
  pending,
  pendingLabel,
  children,
  onClick,
  type = 'button',
  className = 'btn btn--primary',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pending: boolean; pendingLabel?: string }) {
  return (
    <button
      {...rest}
      type={type}
      className={className}
      aria-busy={pending}
      aria-disabled={pending || rest.disabled || undefined}
      data-pending={pending || undefined}
      onClick={(e) => {
        if (pending) e.preventDefault();
        else onClick?.(e);
      }}
    >
      {pending && <span className="spinner spinner--sm" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
