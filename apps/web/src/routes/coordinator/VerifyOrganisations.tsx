/* RECIPIENT VERIFICATION — SITE VISIT CHECKLIST GATES CLAIMING */

import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { EventBanner } from '../../components/EventBanner';
import { VerificationBadge } from '../../components/StatusBadge';
import { Detail, DetailList, EmptyState, PageHead, Section } from '../../components/ui';
import { useApp, useCurrentUser } from '../../store/context';
import { formatDateFull, formatKg } from '../../lib/format';
import { useT, coldChainKey } from '../../i18n/useT';
import './Coordinator.css';
import { canClaim, distanceFromOffice, storageList } from '../../lib/org';

const checks = [
  'Premises visited in person',
  'Storage seen and matches what the profile claims',
  'Food handling and hygiene acceptable',
  'Someone named is responsible for collections',
  'Contact number reaches a person who answers',
];

export function VerifyOrganisations() {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const t = useT();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const pending = state.organisations.filter(
    (o) => o.type === 'recipient' && o.status === 'pending',
  );
  const verified = state.organisations.filter((o) => o.type === 'recipient' && canClaim(o));

  const allTicked = checks.every((c) => ticked[c]);

  return (
    <>
      <PageHead
        title="Verify organisations"
        lead="A recipient cannot claim food until somebody from FEDSA has been to see them."
      />

      <EventBanner />

      <Section title="Awaiting verification" count={pending.length}>
        {pending.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="Nothing waiting"
            body="Every registered organisation has been visited and approved."
          />
        ) : (
          pending.map((org) => (
            <div className="verify-card" key={org.id}>
              <div className="row row--between row--wrap">
                <div>
                  <h3>{org.name}</h3>
                  <p className="muted">
                    {org.suburb} · {distanceFromOffice(org)} km · registered{' '}
                    {formatDateFull(org.joinedAt)}
                  </p>
                </div>
                <VerificationBadge status={org.status} />
              </div>

              <DetailList>
                <Detail label="Contact">
                  {org.contactName}
                  <div className="muted">{org.contactPhone}</div>
                </Detail>
                <Detail label="Claimed capacity">{formatKg(org.maxCapacityKg ?? 0)}</Detail>
                <Detail label="Claimed storage">
                  {storageList(org)
                    .map((s) => t(coldChainKey(s)))
                    .join(', ')}
                </Detail>
                <Detail label="Transport">
                  {org.hasTransport ? 'Own vehicle' : 'Needs a driver'}
                </Detail>
                <Detail label="Meals a day">{org.mealsPerDay ?? '-'}</Detail>
              </DetailList>

              <hr className="divider" style={{ margin: 'var(--s-4) 0' }} />

              <h4>Site visit checklist</h4>
              <ul className="checklist">
                {checks.map((check) => (
                  <li key={check}>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(ticked[check])}
                        onChange={() =>
                          setTicked((current) => ({ ...current, [check]: !current[check] }))
                        }
                      />
                      <span>{check}</span>
                    </label>
                  </li>
                ))}
              </ul>

              <div className="row row--wrap" style={{ gap: 'var(--s-3)' }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() =>
                    dispatch({
                      type: 'SET_VERIFICATION',
                      organisationId: org.id,
                      decision: 'reject',
                      userId: user.id,
                    })
                  }
                >
                  <Icon name="close" size={18} />
                  Do not approve
                </button>
                <button
                  type="button"
                  className="btn btn--go"
                  disabled={!allTicked}
                  onClick={() =>
                    dispatch({
                      type: 'SET_VERIFICATION',
                      organisationId: org.id,
                      decision: 'verify',
                      userId: user.id,
                    })
                  }
                >
                  <Icon name="check" size={18} />
                  Approve for claiming
                </button>
              </div>
              {!allTicked && (
                <p className="field__hint" style={{ marginTop: 'var(--s-2)' }}>
                  Every line has to be checked before an organisation can be approved. This is the
                  record that the visit actually happened.
                </p>
              )}
            </div>
          ))
        )}
      </Section>

      <Section title="Verified organisations" count={verified.length}>
        <ul className="verify-list" aria-label="Recipient organisations already verified">
          {verified.map((org) => (
            <li className="verify-row" key={org.id}>
              <div className="verify-row__top">
                <span className="verify-row__label">
                  <strong>{org.name}</strong>
                  <span className="muted">{org.suburb}</span>
                </span>
                <span className="verify-row__value">
                  <span className="num">{formatKg(org.maxCapacityKg ?? 0)}</span>
                  <span className="muted">capacity</span>
                </span>
              </div>
              <div className="verify-row__meta">
                <span className="muted">
                  {storageList(org)
                    .map((s) => t(coldChainKey(s)))
                    .join(', ')}{' '}
                  · {org.hasTransport ? 'Own vehicle' : 'Needs a driver'}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() =>
                    dispatch({
                      type: 'SET_VERIFICATION',
                      organisationId: org.id,
                      decision: 'suspend',
                      userId: user.id,
                    })
                  }
                >
                  Suspend
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
