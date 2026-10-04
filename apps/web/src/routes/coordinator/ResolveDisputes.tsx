/* DISPUTE RESOLUTION — HANDOVERS THE RECIPIENT MARKED AS A PROBLEM; THE NOTE IS WRITE-ONCE AND AUDITED */

import { useState } from 'react';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { EventBanner } from '../../components/EventBanner';
import { Banner, Detail, DetailList, EmptyState, PageHead } from '../../components/ui';
import { useApp, useCurrentUser } from '../../store/context';
import { collectionForClaim, disputeViews } from '../../store/selectors';
import { formatDateTime, formatKg, formatWhen } from '../../lib/format';
import './Coordinator.css';

function ageOf(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'under an hour old';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} old`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} old`;
}

export function ResolveDisputes() {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;

  const views = disputeViews(state);
  const [selectedId, setSelectedId] = useState(
    views.find((v) => !v.handover.resolvedAt)?.handover.id ?? views[0]?.handover.id ?? '',
  );
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const selected = views.find((v) => v.handover.id === selectedId);
  const open = views.filter((v) => !v.handover.resolvedAt);

  if (views.length === 0) {
    return (
      <>
        <PageHead title="Disputes" />
        <EmptyState
          icon="check-circle"
          title="Nothing in dispute"
          body="No recipient has reported a problem with a handover."
        />
      </>
    );
  }

  function resolve() {
    setTouched(true);
    if (!selected || note.trim() === '') return;
    dispatch({
      type: 'RESOLVE_DISPUTE',
      handoverId: selected.handover.id,
      note: note.trim(),
      userId: user.id,
    });
    setNote('');
    setTouched(false);
  }

  const handover = selected?.handover;

  return (
    <>
      <PageHead
        title="Disputes"
        lead={`${open.length} waiting on a decision. Each is a handover the recipient marked as a problem.`}
      />

      <EventBanner />

      <div className="dispute-layout">
        <div>
          <h2 className="sr-only">Dispute queue</h2>
          <ul className="dispute-queue">
            {views.map((view) => (
              <li key={view.handover.id}>
                <button
                  type="button"
                  aria-current={view.handover.id === selectedId}
                  data-resolved={Boolean(view.handover.resolvedAt)}
                  onClick={() => {
                    setSelectedId(view.handover.id);
                    setNote('');
                    setTouched(false);
                  }}
                >
                  <span className="dispute-queue__ref">
                    <span>{view.offer?.reference}</span>
                  </span>
                  <span className="dispute-queue__type">Problem reported</span>
                  <span className="dispute-queue__sub">
                    {view.donorOrg?.name} · {view.recipientOrg?.name}
                  </span>
                  <span className="dispute-queue__sub">
                    {view.handover.resolvedAt
                      ? `Closed ${formatWhen(view.handover.resolvedAt)}`
                      : ageOf(view.handover.recipientConfirmedAt!)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected && selected.offer && handover && (
          <div className="panel">
            <div className="row row--between row--wrap">
              <div>
                <h2>Problem reported</h2>
                <p className="muted">
                  {selected.offer.reference} · reported {formatWhen(handover.recipientConfirmedAt!)}
                </p>
              </div>
              <span className="badge" data-tone={handover.resolvedAt ? 'collected' : 'expiring'}>
                {handover.resolvedAt ? 'Resolved' : 'Open'}
              </span>
            </div>

            <p className="section__lead" style={{ marginTop: 'var(--s-3)' }}>
              The handover record stays as both sides confirmed it. Speak to both, then record what
              happened and what was agreed.
            </p>

            <DetailList>
              <Detail label="Offer">
                {selected.offer.title}
                <div className="muted">{formatKg(selected.offer.offeredQuantityKg)} offered</div>
              </Detail>
              <Detail label="Donor">
                {selected.donorOrg?.name}
                <div className="muted">{selected.donorOrg?.suburb}</div>
              </Detail>
              <Detail label="Recipient">
                {selected.recipientOrg?.name}
                <div className="muted">{selected.recipientOrg?.suburb}</div>
              </Detail>
              {selected.claim && (
                <Detail label="Transport">
                  {selected.claim.transportNeeded
                    ? (collectionForClaim(state, selected.claim.id)?.driverName ??
                      'Driver never dispatched')
                    : 'Recipient collected themselves'}
                </Detail>
              )}
            </DetailList>

            <h3 style={{ marginTop: 'var(--s-5)' }}>What each side recorded</h3>

            <div className="evidence">
              <div className="evidence__side">
                <div className="evidence__head">
                  <Icon name="check-circle" size={18} />
                  Donor · {selected.donorUser?.name ?? selected.donorOrg?.name}
                </div>
                {handover.donorPhoto && (
                  <FoodPhoto photo={handover.donorPhoto} className="evidence__photo" />
                )}
                <div className="evidence__facts">
                  <div className="evidence__qty">{formatKg(handover.collectedQuantityKg)}</div>
                  <p className="muted">Confirmed {formatDateTime(handover.donorConfirmedAt)}</p>
                </div>
              </div>

              <div className="evidence__side" data-conflict={true}>
                <div className="evidence__head">
                  <Icon name="alert" size={18} />
                  Recipient · {selected.recipientUser?.name ?? selected.recipientOrg?.name}
                </div>
                <div className="evidence__facts">
                  <p className="muted">
                    Confirmed {formatDateTime(handover.recipientConfirmedAt!)} · condition{' '}
                    <strong>poor</strong>
                  </p>
                  {handover.conditionNotes && (
                    <p className="detail__desc">“{handover.conditionNotes}”</p>
                  )}
                </div>
              </div>
            </div>

            {handover.resolvedAt ? (
              <Banner tone="good" title="Resolved">
                {handover.resolutionNote && `“${handover.resolutionNote}”`}
              </Banner>
            ) : (
              <>
                <div className="field" style={{ marginTop: 'var(--s-4)' }}>
                  <label className="field__label" htmlFor="dispute-note">
                    What happened, and what you did about it
                  </label>
                  <textarea
                    id="dispute-note"
                    className="textarea"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    aria-invalid={touched && note.trim() === ''}
                    placeholder="Phoned both sides. Two trays were left behind at the hotel and collected the next morning."
                  />
                  <span className="field__hint">
                    Saved once, and kept on the audit trail with your name against it.
                  </span>
                  {touched && note.trim() === '' && (
                    <span className="field__error" role="alert">
                      Write what was agreed before closing this.
                    </span>
                  )}
                </div>

                <div className="resolution-actions">
                  <button type="button" className="btn btn--primary" onClick={resolve}>
                    Record the resolution and close
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
