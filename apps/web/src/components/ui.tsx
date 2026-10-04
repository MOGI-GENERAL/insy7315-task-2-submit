/* SHARED UI PRIMITIVES: page head, empty state, stat tiles, banner */

import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export function PageHead({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="row row--between row--wrap">
        <h1>{title}</h1>
        {actions && <div className="row">{actions}</div>}
      </div>
      {lead && <p>{lead}</p>}
    </header>
  );
}

/** @deprecated use `Empty` from `components/feedback` */
export { Empty as EmptyState } from './feedback/Empty';

export function StatTile({
  icon,
  label,
  value,
  unit,
  note,
  tone = 'neutral',
}: {
  icon?: IconName;
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="stat" data-tone={tone}>
      {icon && (
        <span className="stat__icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="stat__text">
        <span className="stat__label">{label}</span>
        {note && <span className="stat__note">{note}</span>}
      </span>
      <span className="stat__value num">
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </span>
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="stat-row">{children}</div>;
}

export type BannerTone = 'info' | 'good' | 'warn' | 'bad';

export function Banner({
  tone = 'info',
  title,
  children,
  onDismiss,
}: {
  tone?: BannerTone;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const icon: IconName =
    tone === 'good' ? 'check-circle' : tone === 'bad' || tone === 'warn' ? 'alert' : 'shield';
  return (
    <div className="banner" data-tone={tone} role="status">
      <Icon name={icon} size={20} />
      <div className="banner__body">
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button type="button" className="banner__close" onClick={onDismiss}>
          <Icon name="close" size={18} title="Dismiss" />
        </button>
      )}
    </div>
  );
}

export function Section({
  title,
  count,
  lead,
  actions,
  children,
}: {
  title: string;
  count?: number;
  lead?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="row row--between section__head">
        <h2>
          {title}
          {count !== undefined && <span className="section__count">{count}</span>}
        </h2>
        {actions}
      </div>
      {lead && <p className="section__lead">{lead}</p>}
      {children}
    </section>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="detail-list">{children}</dl>;
}
