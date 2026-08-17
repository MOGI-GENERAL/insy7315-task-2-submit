/* DISPUTE RESOLUTION — MISMATCH / NON-COLLECTION / FOOD CONDITION; DECISION WRITES TO AUDIT TRAIL */

import { useState } from 'react';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { EventBanner } from '../../components/EventBanner';
import { Banner, Detail, DetailList, EmptyState, PageHead } from '../../components/ui';
import { useApp, useCurrentUser } from '../../store/context';
import { collectionForClaim, disputeViews } from '../../store/selectors';
import { formatDateTime, formatKg, formatWhen, timeLeft } from '../../lib/format';
import type { DisputeType } from '../../store/types';
import './Coordinator.css';

const typeLabel: Record<DisputeType, string> = {
  'handover-mismatch': 'Quantity mismatch',
  'non-collection': 'Never collected',
  'food-condition': 'Food condition',
};

const typeExplain: Record<DisputeType, string> = {
  'handover-mismatch':
    'The donor and the recipient recorded different weights for the same handover. The figure you accept is the one that reaches the funder report and the tax certificate.',
  'non-collection':
    'The offer was claimed and the collection window passed with no confirmation from either side. Recording why keeps this separate from an offer nobody claimed.',
  'food-condition':
    'The recipient reported the food as poor on arrival. Decide whether the donation still counts and whether the donor needs a conversation.',
};

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
  const [selectedId, setSelectedId] = useState(views.find((v) => v.dispute.status === 'open')?.dispute.id ?? views[0]?.dispute.id ?? '');
  const [note, setNote] = useState('');

  const selected = views.find((v) => v.dispute.id === selectedId);
  const open = views.filter((v) => v.dispute.status === 'open');

  if (views.length === 0) {
    return (
      <>
        <PageHead title="Disputes" />
        <EmptyState
          icon="check-circle"
          title="Nothing in dispute"
          body="Every handover on the platform has been agreed by both parties."
        />
      </>
    );
  }

  const handover = selected?.handover;
  const donorKg = handover?.donorQuantityKg;
  const recipientKg = handover?.recipientQuantityKg;
  const conflict =
    donorKg != null && recipientKg != null && Math.abs(donorKg - recipientKg) > 2;

  function resolve(resolution: 'accepted-donor-figure' | 'accepted-recipient-figure' | 'noted-and-closed') {
    if (!selected) return;
    dispatch({
      type: 'RESOLVE_DISPUTE',
      disputeId: selected.dispute.id,
      resolution,
      note: note.trim(),
      userId: user.id,
    });
    setNote('');
  }

  return (
    <>
      <PageHead
        title="Disputes"
        lead={`${open.length} waiting on a decision. Each one changes what the reporting counts.`}
      />

      <EventBanner />

      <div className="dispute-layout">
        <div>
          <h2 className="sr-only">Dispute queue</h2>
          <ul className="dispute-queue">
            {views.map((view) => (
              <li key={view.dispute.id}>
                <button
                  type="button"
                  aria-current={view.dispute.id === selectedId}
                  data-resolved={view.dispute.status === 'resolved'}
                  onClick={() => {
                    setSelectedId(view.dispute.id);
                    setNote('');
                  }}
                >
                  <span className="dispute-queue__ref">
                    <span>{view.dispute.reference}</span>
                    <span>{view.offer?.reference}</span>
                  </span>
                  <span className="dispute-queue__type">{typeLabel[view.dispute.type]}</span>
                  <span className="dispute-queue__sub">
                    {view.donorOrg?.name} · {view.recipientOrg?.name}
                  </span>
                  <span className="dispute-queue__sub">
                    {view.dispute.status === 'resolved'
                      ? `Closed ${formatWhen(view.dispute.resolvedAt!)}`
                      : ageOf(view.dispute.openedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected && selected.offer && (
          <div className="panel">
            <div className="row row--between row--wrap">
              <div>
                <h2>{typeLabel[selected.dispute.type]}</h2>
                <p className="muted">
                  {selected.dispute.reference} on {selected.offer.reference} · opened{' '}
                  {formatWhen(selected.dispute.openedAt)}
                </p>
              </div>
              <span
                className="badge"
                data-tone={selected.dispute.status === 'open' ? 'expiring' : 'collected'}
              >
                {selected.dispute.status === 'open' ? 'Open' : 'Resolved'}
              </span>
            </div>

            <p className="section__lead" style={{ marginTop: 'var(--s-3)' }}>
              {typeExplain[selected.dispute.type]}
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
              <Detail label="Collection deadline">
                {formatDateTime(selected.offer.collectionDeadline)}
                <div className="muted">
                  {timeLeft(selected.offer.collectionDeadline) ?? 'Window closed'}
                </div>
              </Detail>
              {selected.claim && (
                <Detail label="Transport">
                  {selected.claim.needsTransport
                    ? collectionForClaim(state, selected.claim.id)?.driverName ??
                      'Driver never dispatched'
                    : 'Recipient collected themselves'}
                </Detail>
              )}
            </DetailList>

            <h3 style={{ marginTop: 'var(--s-5)' }}>What each side recorded</h3>

            <div className="evidence">
              <div className="evidence__side" data-conflict={conflict}>
                <div className="evidence__head">
                  <Icon name={handover?.donorConfirmedAt ? 'check-circle' : 'alert'} size={18} />
                  Donor · {selected.donorUser?.name ?? selected.donorOrg?.name}
                </div>
                {handover?.donorPhoto && (
                  <FoodPhoto photo={handover.donorPhoto} className="evidence__photo" />
                )}
                <div className="evidence__facts">
                  {handover?.donorConfirmedAt ? (
                    <>
                      <div className="evidence__qty">{formatKg(donorKg ?? 0)}</div>
                      <p className="muted">
                        Confirmed {formatDateTime(handover.donorConfirmedAt)}
                      </p>
                    </>
                  ) : (
                    <p className="muted">
                      Never confirmed. The food was not recorded as leaving the premises.
                    </p>
                  )}
                </div>
              </div>

              <div className="evidence__side" data-conflict={conflict}>
                <div className="evidence__head">
                  <Icon
                    name={handover?.recipientConfirmedAt ? 'check-circle' : 'alert'}
                    size={18}
                  />
                  Recipient · {selected.recipientUser?.name ?? selected.recipientOrg?.name}
                </div>
                <div className="evidence__facts">
                  {handover?.recipientConfirmedAt ? (
                    <>
                      <div className="evidence__qty">{formatKg(recipientKg ?? 0)}</div>
                      <p className="muted">
                        Confirmed {formatDateTime(handover.recipientConfirmedAt)} · condition{' '}
                        <strong>{handover.recipientCondition}</strong>
                      </p>
                      {handover.recipientNote && (
                        <p className="detail__desc">“{handover.recipientNote}”</p>
                      )}
                    </>
                  ) : (
                    <p className="muted">Never confirmed. Nothing was recorded as arriving.</p>
                  )}
                </div>
              </div>
            </div>

            {conflict && (
              <Banner tone="bad" title="The two records disagree">
                A difference of {formatKg(Math.abs((donorKg ?? 0) - (recipientKg ?? 0)))}. Whichever
                figure you accept is written to both records and becomes the number the funder
                report and the tax certificate use.
              </Banner>
            )}

            {selected.dispute.status === 'open' ? (
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
                    placeholder="Phoned both sides. Two trays were left behind at the hotel and collected the next morning."
                  />
                  <span className="field__hint">
                    Kept on the audit trail with your name against it.
                  </span>
                </div>

                <div className="resolution-actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={donorKg == null}
                    onClick={() => resolve('accepted-donor-figure')}
                  >
                    Accept {donorKg != null ? formatKg(donorKg) : 'donor figure'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={recipientKg == null}
                    onClick={() => resolve('accepted-recipient-figure')}
                  >
                    Accept {recipientKg != null ? formatKg(recipientKg) : 'recipient figure'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => resolve('noted-and-closed')}
                  >
                    Record a note and close
                  </button>
                </div>
              </>
            ) : (
              <Banner tone="good" title="Resolved">
                {selected.dispute.resolution === 'accepted-donor-figure' &&
                  "The coordinator accepted the donor's figure. "}
                {selected.dispute.resolution === 'accepted-recipient-figure' &&
                  "The coordinator accepted the recipient's figure. "}
                {selected.dispute.resolution === 'noted-and-closed' &&
                  'Closed with a note, with both records left as they were. '}
                {selected.dispute.resolutionNote && `“${selected.dispute.resolutionNote}”`}
              </Banner>
            )}
          </div>
        )}
      </div>
    </>
  );
}
