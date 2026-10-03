import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

export function Empty({
  icon = 'box',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
