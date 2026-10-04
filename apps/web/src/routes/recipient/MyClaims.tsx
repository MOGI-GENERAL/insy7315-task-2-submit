import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ClaimStatus } from '@fedsa/contract';
import { useSession } from '../../auth/context';
import { useData, useLoad } from '../../data';
import { Empty, LoadState } from '../../components/feedback';
import { OfferPhoto } from '../../components/OfferPhoto';
import { Icon } from '../../components/Icon';
import { Banner, PageHead } from '../../components/ui';
import { useT } from '../../i18n/useT';
import type { StringKey } from '../../i18n/strings';
import { formatKg, formatWhen } from '../../lib/format';
import type { ClaimedState } from './ClaimConfirm';
import './Recipient.css';

const statusLabel: Record<ClaimStatus, StringKey> = {
  active: 'claims.awaitingCollection',
  fulfilled: 'claims.complete',
  released: 'claims.released',
  expired: 'claims.expired',
};

const statusTone: Record<ClaimStatus, string> = {
  active: 'open',
  fulfilled: 'collected',
  released: 'expired',
  expired: 'expired',
};

export function MyClaims() {
  const { organisation } = useSession();
  const { claims } = useData();
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const list = useLoad(() => claims.list({}), [claims]);
  const justClaimed = (location.state as ClaimedState | null)?.claimed;

  return (
    <>
      <PageHead title={t('claims.title')} lead={organisation?.name} />

      {justClaimed && (
        <Banner
          tone="good"
          title={t('claims.collectFrom')}
          onDismiss={() => navigate(location.pathname, { replace: true, state: null })}
        >
          {justClaimed.donorContact.addressLine}, {justClaimed.donorContact.suburb}.{' '}
          {t('claims.askFor')} {justClaimed.donorContact.name},{' '}
          <a href={`tel:${justClaimed.donorContact.phone}`}>{justClaimed.donorContact.phone}</a>.
        </Banner>
      )}

      <LoadState result={list}>
        {({ items }) => {
          const active = items.filter((c) => c.status === 'active');
          const past = items.filter((c) => c.status !== 'active');
          const shown = tab === 'active' ? active : past;

          return (
            <>
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
                <Empty
                  icon="check-circle"
                  title={tab === 'active' ? t('claims.empty') : t('claims.pastEmpty')}
                  body={tab === 'active' ? t('claims.emptyHint') : t('claims.pastEmptyHint')}
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
                  {shown.map((claim) => (
                    <li key={claim.id} className="claim-row">
                      <div className="claim-row__photo">
                        <OfferPhoto photos={claim.offer.photos} alt={claim.offer.title} />
                      </div>

                      <div className="claim-row__body">
                        <span className="claim-row__title">{claim.offer.title}</span>
                        <span className="claim-row__meta">
                          {claim.offer.reference} · {formatKg(claim.offer.offeredQuantityKg)} ·{' '}
                          {claim.offer.donor.name}, {claim.offer.donor.suburb}
                        </span>
                        <span className="claim-row__meta">
                          {t('claims.claimed')} {formatWhen(claim.claimedAt)}
                          {claim.releasedAt &&
                            ` · ${t('claims.releasedAt')} ${formatWhen(claim.releasedAt)}`}
                        </span>
                        <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                          <span className="badge" data-tone={statusTone[claim.status]}>
                            {t(statusLabel[claim.status])}
                          </span>
                          {claim.transportNeeded && (
                            <span className="badge badge--quiet">
                              <Icon name="truck" size={14} />
                              {t('claims.transportRequested')}
                            </span>
                          )}
                        </div>
                        {claim.releaseReason && (
                          <span className="claim-row__meta">
                            {t('claims.reason')}: {claim.releaseReason}
                          </span>
                        )}
                      </div>

                      {claim.status === 'active' && (
                        <div className="claim-row__actions">
                          <Link
                            to={`/recipient/offers/${claim.offerId}`}
                            className="btn btn--secondary"
                          >
                            {t('claims.viewOffer')}
                          </Link>
                          <Link
                            to={`/recipient/claims/${claim.id}/release`}
                            className="btn btn--ghost"
                          >
                            {t('claim.release')}
                          </Link>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </LoadState>
    </>
  );
}
