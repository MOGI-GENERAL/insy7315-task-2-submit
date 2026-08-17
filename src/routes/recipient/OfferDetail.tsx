/* OFFER DETAIL — RECIPIENT VIEW */

import { Link, useParams } from 'react-router-dom';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { ColdChainBadge, StatusBadge } from '../../components/StatusBadge';
import { Banner, Detail, DetailList, PageHead } from '../../components/ui';
import { useAppState, useCurrentOrg } from '../../store/context';
import { activeClaimForOffer, checkEligibility, offerById, orgById } from '../../store/selectors';
import { useT, categoryKey } from '../../i18n/useT';
import { formatKg, formatWhen, hasPassed, mealsFromKg } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import '../shared/Detail.css';
import './Recipient.css';

export function OfferDetail() {
  const { offerId } = useParams();
  const state = useAppState();
  const org = useCurrentOrg()!;
  const t = useT();
  const now = useNow();

  const offer = offerById(state, offerId);

  if (!offer) {
    return (
      <Banner tone="bad" title="Offer not found">
        <Link to="/recipient">Back to offers</Link>.
      </Banner>
    );
  }

  const donor = orgById(state, offer.donorOrganisationId);
  const fit = checkEligibility(org, offer);
  const claim = activeClaimForOffer(state, offer.id);
  const claimedByUs = claim?.recipientOrganisationId === org.id;
  const claimedByOther = Boolean(claim) && !claimedByUs;
  const closed = hasPassed(offer.collectionDeadline);
  const scheduled = new Date(offer.availableFrom).getTime() > now;
  const canClaim = offer.status === 'open' && !closed && fit.eligible;

  return (
    <>
      <Link to="/recipient" className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <PageHead
        title={offer.title}
        lead={`${offer.reference} · ${donor?.name}, ${donor?.suburb}`}
        actions={<StatusBadge status={offer.status} deadline={offer.collectionDeadline} />}
      />

      {claimedByOther && (
        <Banner tone="warn" title={t('claim.taken')}>
          {orgById(state, claim!.recipientOrganisationId)?.name} claimed this offer{' '}
          {formatWhen(claim!.claimedAt)}. Only one organisation can hold an offer at a time, so
          nobody arrives to find the food gone.
        </Banner>
      )}

      {claimedByUs && (
        <Banner tone="good" title="This one is yours">
          Your organisation claimed it {formatWhen(claim!.claimedAt)}.{' '}
          <Link to="/recipient/claims">See it in your claims</Link>.
        </Banner>
      )}

      <div className="fit" data-ok={fit.eligible}>
        {fit.eligible ? (
          <>
            <span className="fit__line">
              <Icon name="check-circle" size={18} />
              {t('claim.fits')}
            </span>
            <span className="fit__line">
              <Icon name="scale" size={18} />
              {formatKg(offer.offeredQuantityKg)} against your {org.capacityKg} kg limit
            </span>
            <span className="fit__line">
              <Icon name={org.hasTransport ? 'truck' : 'pin'} size={18} />
              {donor?.distanceKm != null && `${donor.distanceKm} km away · `}
              {org.hasTransport
                ? 'You can collect this yourselves'
                : 'FEDSA will arrange a driver when you claim'}
            </span>
          </>
        ) : (
          fit.reasons.map((reason) => (
            <span className="fit__line" key={reason}>
              <Icon name="alert" size={18} />
              {reason}
            </span>
          ))
        )}
      </div>

      <div className="detail__grid">
        <div className="card detail__media">
          <FoodPhoto photo={offer.photo} className="detail__photo" />
        </div>

        <div className="panel">
          <DetailList>
            <Detail label={t('offer.quantity')}>
              {formatKg(offer.offeredQuantityKg)}
              <div className="muted">
                {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')} {t('offer.meals')}
              </div>
            </Detail>
            <Detail label={t('offer.category')}>{t(categoryKey(offer.category))}</Detail>
            <Detail label={t('offer.storage')}>
              <ColdChainBadge coldChain={offer.coldChain} />
            </Detail>
            <Detail label={t('offer.from')}>
              {donor?.name}
              <div className="muted">{donor?.suburb}</div>
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

      {canClaim && (
        <Link
          to={`/recipient/offers/${offer.id}/claim`}
          className="btn btn--go btn--lg btn--block"
        >
          <Icon name="check" size={20} />
          {t('claim.action')}
        </Link>
      )}

      {closed && offer.status === 'open' && (
        <Banner tone="bad">{t('offer.expired')}.</Banner>
      )}
    </>
  );
}
