export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <img
      src="/FEDSA-logo-only.svg"
      width={size}
      height={size}
      alt={title ?? ''}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    />
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="wordmark">
      <LogoMark size={compact ? 26 : 30} />
      <span className="wordmark__text">
        <img className="wordmark__mark" src="/FEDSA-word-mark.svg" alt="FEDSA" />
      </span>
    </span>
  );
}
