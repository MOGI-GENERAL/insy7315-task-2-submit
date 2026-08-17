/* MY CLAIMS — ACTIVE/PAST LIST + RELEASE ENTRY POINT */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { EventBanner } from '../../components/EventBanner';
import { EmptyState, PageHead } from '../../components/ui';
import { useAppState, useCurrentOrg } from '../../store/context';
import { claimsForRecipient, collectionForClaim } from '../../store/selectors';
import { useT } from '../../i18n/useT';
import { formatKg, formatWhen } from '../../lib/format';
import type { ClaimView } from '../../store/selectors';
import './Recipient.css';

const stageLabel: Record<ClaimView['stage'], string> = {
  'awaiting-collection': 'Waiting for collection',
  'awaiting-your-confirmation': 'Confirm receipt',
  'awaiting-other-party': 'Waiting for the donor',
  complete: 'Complete',
  released: 'Released',
};

const stageTone: Record<ClaimView['stage'], string> = {
  'awaiting-collection': 'open',
  'awaiting-your-confirmation': 'expiring',
  'awaiting-other-party': 'open',
  complete: 'collected',
  released: 'expired',
};

export function MyClaims() {
  const state = useAppState();
  const org = useCurrentOrg()!;
  const t = useT();
  const [tab, setTab] = useState<'active' | 'past'>('active');

  const all = claimsForRecipient(state, org.id);
  const active = all.filter((c) => c.stage !== 'complete' && c.stage !== 'released');
  const past = all.filter((c) => c.stage === 'complete' || c.stage === 'released');
  const shown = tab === 'active' ? active : past;

  return (
    <>
      <PageHead title={t('claims.title')} lead={org.name} />

      <EventBanner />

      <div className="claim-tabs" role="tablist" aria-label={t('claims.title')}>
        <button
          type="button"
          role="tab"
          className="claim-tab"
          aria-selected={tab === 'active'}
          onClick={() => setTab('active')}
        >
          {t('claims.active')} ({active.length})
        </button>
        <button
          type="button"
          role="tab"
          className="claim-tab"
          aria-selected={tab === 'past'}
          onClick={() => setTab('past')}
        >
          {t('claims.past')} ({past.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title={tab === 'active' ? t('claims.empty') : 'Nothing here yet'}
          body={
            tab === 'active'
              ? 'Claim an offer and it will appear here until the handover is confirmed.'
              : 'Completed and released claims are kept here.'
          }
          action={
            tab === 'active' ? (
              <Link to="/recipient" className="btn btn--primary">
                {t('nav.offers')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="claim-list">
          {shown.map((view) => {
            const { claim, offer, donorOrg, stage } = view;
            const collection = collectionForClaim(state, claim.id);
            return (
              <li key={claim.id} className="claim-row">
                <div className="claim-row__photo">
                  <FoodPhoto photo={offer.photo} />
                </div>

                <div className="claim-row__body">
                  <span className="claim-row__title">{offer.title}</span>
                  <span className="claim-row__meta">
                    {offer.reference} · {formatKg(offer.offeredQuantityKg)} · {donorOrg?.name},{' '}
                    {donorOrg?.suburb}
                  </span>
                  <span className="claim-row__meta">
                    Claimed {formatWhen(claim.claimedAt)}
                    {claim.releasedAt && ` · released ${formatWhen(claim.releasedAt)}`}
                  </span>
                  <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                    <span className="badge" data-tone={stageTone[stage]}>
                      {stageLabel[stage]}
                    </span>
                    {claim.needsTransport && (
                      <span className="badge badge--quiet">
                        <Icon name="truck" size={14} />
                        {collection
                          ? `${t('claims.driver')}: ${collection.driverName}`
                          : 'Driver being arranged'}
                      </span>
                    )}
                  </div>
                  {claim.releaseReason && (
                    <span className="claim-row__meta">Reason: {claim.releaseReason}</span>
                  )}
                </div>

                {stage !== 'complete' && stage !== 'released' && (
                  <div className="claim-row__actions">
                    {stage === 'awaiting-your-confirmation' ? (
                      <Link to={`/recipient/handover/${claim.id}`} className="btn btn--go">
                        {t('handover.confirmReceipt')}
                      </Link>
                    ) : (
                      <Link
                        to={`/recipient/offers/${offer.id}`}
                        className="btn btn--secondary"
                      >
                        View offer
                      </Link>
                    )}
                    <Link
                      to={`/recipient/claims/${claim.id}/release`}
                      className="btn btn--ghost"
                    >
                      {t('claim.release')}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
