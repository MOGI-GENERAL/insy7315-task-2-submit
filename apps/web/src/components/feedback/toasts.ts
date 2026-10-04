import { createContext, useContext } from 'react';

export type ToastTone = 'good' | 'bad' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

export const MAX_TOASTS = 3;

/** newest last. the oldest drops off once there are too many */
export function addToast(toasts: Toast[], toast: Toast): Toast[] {
  return [...toasts, toast].slice(-MAX_TOASTS);
}

export function removeToast(toasts: Toast[], id: number): Toast[] {
  return toasts.filter((t) => t.id !== id);
}

/** errors stay until dismissed. a slow reader must not lose them */
export const autoDismissMs = (tone: ToastTone): number | null => (tone === 'bad' ? null : 5000);

export interface ToastApi {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}
