/* ACCOUNT MANAGEMENT: DISABLE (NOT DELETE) TO PRESERVE HISTORY */

import { EventBanner } from '../../components/EventBanner';
import { PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useApp, useCurrentUser } from '../../store/context';
import { orgById } from '../../store/selectors';
import { formatDateTime } from '../../lib/format';
import type { Role } from '../../store/types';
import './Admin.css';

const roleLabel: Record<Role, string> = {
  donor: 'Donor',
  recipient: 'Recipient',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
};

export function ManageAccounts() {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;

  const sorted = [...state.users].sort((a, b) => a.name.localeCompare(b.name));
  const activeCount = state.users.filter((u) => u.active).length;

  return (
    <>
      <PageHead
        title="Accounts"
        lead="Every login on the platform. Disabling keeps a record; nothing is deleted."
      />

      <EventBanner />

      <StatRow>
        <StatTile icon="check-circle" label="Active accounts" value={String(activeCount)} tone="good" />
        <StatTile
          icon="alert"
          label="Disabled"
          value={String(state.users.length - activeCount)}
          tone="neutral"
        />
        <StatTile icon="people" label="Total" value={String(state.users.length)} />
      </StatRow>

      <Section title="All accounts">
        <ul className="account-list" aria-label="User accounts and their status">
          {sorted.map((u) => {
            const org = orgById(state, u.organisationId);
            return (
              <li className="account-card" key={u.id} data-disabled={!u.active}>
                <div className="account-card__top">
                  <span className="account-card__who">
                    <strong>{u.name}</strong>
                    <span className="muted">{u.jobTitle}</span>
                    <span className="muted">
                      {roleLabel[u.role]} · {org?.name ?? 'FEDSA'}
                    </span>
                  </span>
                  <span className="badge" data-tone={u.active ? 'collected' : 'expired'}>
                    {u.active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost account-card__action"
                  onClick={() =>
                    dispatch({ type: 'TOGGLE_ACCOUNT', targetUserId: u.id, userId: user.id })
                  }
                >
                  {u.active ? 'Disable' : 'Enable'}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Recent account activity">
        <ul className="audit-list" aria-label="Audit trail of administrative actions">
          {state.audit.slice(0, 15).map((entry) => {
            const actor = state.users.find((u) => u.id === entry.actorUserId);
            return (
              <li className="audit-row" key={entry.id}>
                <div className="audit-row__top">
                  <strong>
                    {entry.action} · {entry.target}
                  </strong>
                  <time className="muted">{formatDateTime(entry.at)}</time>
                </div>
                <div className="muted">
                  {actor?.name ?? 'System'}
                  {entry.detail ? ` - ${entry.detail}` : ''}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
