/* CAPACITY NOTES — FREE-TEXT TACIT KNOWLEDGE PER ORG */

import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { EventBanner } from '../../components/EventBanner';
import { VerificationBadge } from '../../components/StatusBadge';
import { Detail, DetailList, PageHead } from '../../components/ui';
import { useApp, useCurrentUser } from '../../store/context';
import { claimsForRecipient } from '../../store/selectors';
import { useT, coldChainKey } from '../../i18n/useT';
import { formatKg } from '../../lib/format';
import type { Organisation } from '../../store/types';
import './Coordinator.css';
import { distanceFromOffice, storageList } from '../../lib/org';

export function CapacityNotes() {
  const { state } = useApp();

  const organisations = [...state.organisations].sort((a, b) => a.name.localeCompare(b.name));
  const [selectedId, setSelectedId] = useState(organisations[0]?.id ?? '');
  const selected = state.organisations.find((o) => o.id === selectedId);

  return (
    <>
      <PageHead
        title="Organisations"
        lead="What FEDSA knows about each one, written down rather than remembered."
      />

      <EventBanner />

      <div className="field">
        <label className="field__label" htmlFor="org-picker">
          Choose an organisation
        </label>
        <select
          id="org-picker"
          className="select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {organisations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name} · {org.type === 'donor' ? 'Donor' : 'Recipient'} · {org.suburb}
            </option>
          ))}
        </select>
      </div>

      {/* KEY FORCES REMOUNT SO STATE RESETS PER ORG */}
      {selected && <OrgPanel key={selected.id} org={selected} />}
    </>
  );
}

function OrgPanel({ org }: { org: Organisation }) {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const t = useT();

  const [note, setNote] = useState(org.capacityNotes);
  const claims = org.type === 'recipient' ? claimsForRecipient(state, org.id) : [];
  const dirty = note !== org.capacityNotes;

  return (
    <div className="panel">
      <div className="row row--between row--wrap">
        <div>
          <h2>{org.name}</h2>
          <p className="muted">
            {org.type === 'donor' ? 'Donor' : 'Recipient'} · {org.suburb} ·{' '}
            {distanceFromOffice(org)} km
          </p>
        </div>
        <VerificationBadge status={org.status} />
      </div>

      <hr className="divider" style={{ margin: 'var(--s-4) 0' }} />

      <DetailList>
        <Detail label="Contact">
          {org.contactName}
          <div className="muted">{org.contactPhone}</div>
        </Detail>
        {org.type === 'recipient' && (
          <>
            <Detail label="Capacity">{formatKg(org.maxCapacityKg ?? 0)}</Detail>
            <Detail label="Storage">
              {storageList(org)
                .map((s) => t(coldChainKey(s)))
                .join(', ')}
            </Detail>
            <Detail label="Transport">{org.hasTransport ? 'Own vehicle' : 'Needs a driver'}</Detail>
            <Detail label="Meals a day">{org.mealsPerDay ?? '-'}</Detail>
            <Detail label="Claims to date">{claims.length}</Detail>
          </>
        )}
      </DetailList>

      <hr className="divider" style={{ margin: 'var(--s-4) 0' }} />

      <div className="field">
        <label className="field__label" htmlFor="capacity-note">
          What we know about them
        </label>
        <textarea
          id="capacity-note"
          className="textarea"
          rows={7}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything that decides whether a match works. Storage quirks, who answers the phone, what they will and will not take."
          aria-describedby="capacity-note-hint"
        />
        <span className="field__hint" id="capacity-note-hint">
          Visible to every coordinator, and never to the organisation itself. This is operational
          knowledge, not an assessment, and nothing here ranks anybody.
        </span>
      </div>

      <button
        type="button"
        className="btn btn--primary"
        disabled={!dirty}
        onClick={() =>
          dispatch({
            type: 'SAVE_CAPACITY_NOTE',
            organisationId: org.id,
            note,
            userId: user.id,
          })
        }
      >
        <Icon name="check" size={18} />
        {dirty ? 'Save notes' : 'Saved'}
      </button>
    </div>
  );
}
