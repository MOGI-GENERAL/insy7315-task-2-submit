import { useT } from '../../i18n/useT';

export function Loading({ label, inline = false }: { label?: string; inline?: boolean }) {
  const t = useT();
  return (
    <div className={inline ? 'loading loading--inline' : 'loading'} role="status">
      <span className="spinner" aria-hidden="true" />
      <span className={inline ? 'sr-only' : undefined}>{label ?? t('feedback.loading')}</span>
    </div>
  );
}
