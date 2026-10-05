import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/context';
import { useData, useLoad } from '../../data';
import { LoadState } from '../../components/feedback';
import { OfferPhoto } from '../../components/OfferPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { ColdChainBadge, StatusBadge } from '../../components/StatusBadge';
import { Banner, Detail, DetailList, PageHead } from '../../components/ui';
import { useT, categoryKey } from '../../i18n/useT';
import { formatKg, formatWhen, hasPassed, mealsFromKg } from '../../lib/format';
import { distanceKm } from '../../lib/org';
import { useNow } from '../../lib/useNow';
import '../shared/Detail.css';
import './Recipient.css';

export function OfferDetail() {
  const { offerId = '' } = useParams();
  const { organisation } = useSession();
  const { offers } = useData();
  const t = useT();
  const now = useNow();
  const detail = useLoad(() => offers.get(offerId), [offers, offerId]);
  const recipient = organisation?.type === 'recipient' ? organisation : null;

  return (
    <>
      <Link to="/recipient" className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <LoadState result={detail}>
        {({ offer, claim, collection, handover }) => {
          // a recipient only ever sees its own claim, which may be an old released one
          const ours = claim?.status === 'active' ? claim : null;
          const takenByOther = offer.status === 'claimed' && !ours;
          const scheduled = new Date(offer.availableFrom).getTime() > now;
          const closed = hasPassed(offer.collectionDeadline, new Date(now));
          const claimable = offer.status === 'open' && !scheduled && !closed;
          const awaitingUs = Boolean(handover && !handover.recipientConfirmedAt);

          return (
            <>
              <PageHead
                title={offer.title}
                lead={`${offer.reference} · ${offer.donor.name}, ${offer.donor.suburb}`}
                actions={<StatusBadge status={offer.status} deadline={offer.collectionDeadline} />}
              />

              {takenByOther && (
                <Banner tone="warn" title={t('claim.taken')}>
                  {t('detail.takenBody')}
                </Banner>
              )}

              {ours && (
                <Banner tone="good" title={t('detail.yours')}>
                  {t('detail.yoursBody')} {formatWhen(ours.claimedAt)}.{' '}
                  <Link to="/recipient/claims">{t('detail.seeClaims')}</Link>.
                </Banner>
              )}

              {ours && collection && (
                <Banner tone="info" title={t('detail.driverComing')}>
                  {collection.driverName}, {collection.driverPhone}
                  {collection.scheduledFor && ` · ${formatWhen(collection.scheduledFor)}`}
                </Banner>
              )}

              {recipient && claimable && (
                <div className="fit" data-ok="true">
                  <span className="fit__line">
                    <Icon name="check-circle" size={18} />
                    {t('claim.fits')}
                  </span>
                  {recipient.maxCapacityKg !== null && (
                    <span className="fit__line">
                      <Icon name="scale" size={18} />
                      {formatKg(offer.offeredQuantityKg)} {t('detail.againstLimit')}{' '}
                      {formatKg(recipient.maxCapacityKg)}
                    </span>
                  )}
                  <span className="fit__line">
                    <Icon name={recipient.hasTransport ? 'truck' : 'pin'} size={18} />
                    {distanceKm(recipient.location, offer.donor.location)} km ·{' '}
                    {recipient.hasTransport ? t('detail.collectYourselves') : t('detail.driverArranged')}
                  </span>
                </div>
              )}

              <div className="detail__grid">
                <div className="card detail__media">
                  <OfferPhoto photos={offer.photos} alt={offer.title} full className="detail__photo" />
                </div>

                <div className="panel">
                  <DetailList>
                    <Detail label={t('offer.quantity')}>
                      {formatKg(offer.offeredQuantityKg)}
                      <div className="muted">
                        {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')}{' '}
                        {t('offer.meals')}
                      </div>
                    </Detail>
                    <Detail label={t('offer.category')}>{t(categoryKey(offer.category))}</Detail>
                    <Detail label={t('offer.storage')}>
                      <ColdChainBadge coldChain={offer.coldChain} />
                    </Detail>
                    <Detail label={t('offer.from')}>
                      {offer.donor.name}
                      <div className="muted">{offer.donor.suburb}</div>
                    </Detail>
                    <Detail label={scheduled ? t('offer.availableFrom') : t('offer.collectBy')}>
                      {scheduled ? (
                        formatWhen(offer.availableFrom)
                      ) : (
                        <>
                          {formatWhen(offer.collectionDeadline)}
                          <div>
                            <Countdown deadline={offer.collectionDeadline} showClock={false} />
                          </div>
                        </>
                      )}
                    </Detail>
                  </DetailList>

                  {offer.description && (
                    <>
                      <hr className="divider" />
                      <p className="detail__desc">{offer.description}</p>
                    </>
                  )}
                </div>
              </div>

              {claimable && (
                <Link
                  to={`/recipient/offers/${offer.id}/claim`}
                  className="btn btn--go btn--lg btn--block"
                >
                  <Icon name="check" size={20} />
                  {t('claim.action')}
                </Link>
              )}

              {ours && awaitingUs && (
                <Link to={`/recipient/offers/${offer.id}/handover`} className="btn btn--go btn--lg btn--block">
                  {t('handover.confirmReceipt')}
                </Link>
              )}

              {closed && offer.status === 'open' && (
                <Banner tone="bad">{t('offer.expired')}.</Banner>
              )}
            </>
          );
        }}
      </LoadState>
    </>
  );
}
