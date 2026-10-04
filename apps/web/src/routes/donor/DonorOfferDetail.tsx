/* DONOR OFFER DETAIL — CLAIM STATUS + LIVE HANDOVER RECORD */

import { Link, useParams } from 'react-router-dom';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { ColdChainBadge, StatusBadge } from '../../components/StatusBadge';
import { EventBanner } from '../../components/EventBanner';
import { Banner, Detail, DetailList, PageHead, Section } from '../../components/ui';
import { useApp, useCurrentOrg } from '../../store/context';
import {
  activeClaimForOffer,
  collectionForClaim,
  handoverForClaim,
  offerById,
  orgById,
} from '../../store/selectors';
import { useT, categoryKey } from '../../i18n/useT';
import { formatDateTime, formatKg, formatWhen, mealsFromKg } from '../../lib/format';
import '../shared/Detail.css';

export function DonorOfferDetail() {
  const { offerId } = useParams();
  const { state, dispatch } = useApp();
  const org = useCurrentOrg()!;
  const t = useT();

  const offer = offerById(state, offerId);

  if (!offer || offer.donorOrganisationId !== org.id) {
    return (
      <Banner tone="bad" title="Offer not found">
        That offer does not belong to {org.name}. <Link to="/donor">Back to your offers</Link>.
      </Banner>
    );
  }

  const claim = activeClaimForOffer(state, offer.id);
  const recipient = orgById(state, claim?.recipientOrganisationId);
  const handover = claim ? handoverForClaim(state, claim.id) : undefined;
  const collection = claim ? collectionForClaim(state, claim.id) : undefined;
  const needsMyConfirmation = Boolean(claim && handover && !handover.donorConfirmedAt);

  return (
    <>
      <Link to="/donor" className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <EventBanner />

      <PageHead
        title={offer.title}
        lead={`${offer.reference} · ${org.name}, ${org.suburb}`}
        actions={<StatusBadge status={offer.status} deadline={offer.collectionDeadline} />}
      />

      {claim && recipient && (
        <div className="claimed-alert">
          <div className="claimed-alert__icon">
            <Icon name="check-circle" size={28} />
          </div>
          <div className="claimed-alert__body">
            <strong>{recipient.name} claimed this offer</strong>
            <span>
              {recipient.suburb} · claimed {formatWhen(claim.claimedAt)}
            </span>
            <span className="claimed-alert__transport">
              {claim.transportNeeded ? (
                collection ? (
                  <>
                    <Icon name="truck" size={16} /> {collection.driverName} is collecting on their
                    behalf
                  </>
                ) : (
                  <>
                    <Icon name="clock" size={16} /> FEDSA is arranging a driver
                  </>
                )
              ) : (
                <>
                  <Icon name="truck" size={16} /> They are collecting themselves
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {needsMyConfirmation && (
        <Link to={`/donor/handover/${claim!.id}`} className="btn btn--go btn--lg btn--block">
          <Icon name="camera" size={20} />
          {t('handover.confirm')}
        </Link>
      )}

      <div className="detail__grid">
        <div className="card detail__media">
          <FoodPhoto photo={offer.photo} className="detail__photo" />
        </div>

        <div className="panel">
          <DetailList>
            <Detail label={t('offer.quantity')}>
              {formatKg(offer.offeredQuantityKg)}
              <div className="muted">
                {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')} meals
              </div>
            </Detail>
            <Detail label={t('offer.category')}>{t(categoryKey(offer.category))}</Detail>
            <Detail label={t('offer.storage')}>
              <ColdChainBadge coldChain={offer.coldChain} />
            </Detail>
            <Detail label={t('offer.availableFrom')}>{formatWhen(offer.availableFrom)}</Detail>
            <Detail label={t('offer.collectBy')}>
              {formatWhen(offer.collectionDeadline)}
              {offer.status === 'open' && (
                <div>
                  <Countdown deadline={offer.collectionDeadline} showClock={false} />
                </div>
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

      {handover && (handover.donorConfirmedAt || handover.recipientConfirmedAt) && (
        <Section
          title="Handover record"
          lead="Both confirmations and the photograph are what protect your business if the food is ever questioned."
        >
          <div className="handover-pair">
            <div className="handover-side" data-done={Boolean(handover.donorConfirmedAt)}>
              <h3>
                <Icon name={handover.donorConfirmedAt ? 'check-circle' : 'clock'} size={18} />
                {t('handover.donorConfirmed')}
              </h3>
              {handover.donorConfirmedAt ? (
                <DetailList>
                  <Detail label="Weight">{formatKg(handover.collectedQuantityKg)}</Detail>
                  <Detail label="Time">{formatDateTime(handover.donorConfirmedAt)}</Detail>
                </DetailList>
              ) : (
                <p className="muted">Not yet confirmed.</p>
              )}
            </div>

            <div className="handover-side" data-done={Boolean(handover.recipientConfirmedAt)}>
              <h3>
                <Icon name={handover.recipientConfirmedAt ? 'check-circle' : 'clock'} size={18} />
                {t('handover.recipientConfirmed')}
              </h3>
              {handover.recipientConfirmedAt ? (
                <DetailList>
                  <Detail label="Condition">
                    {handover.conditionOnReceipt === 'problem'
                      ? 'Problem reported'
                      : handover.conditionOnReceipt}
                  </Detail>
                  <Detail label="Time">{formatDateTime(handover.recipientConfirmedAt)}</Detail>
                </DetailList>
              ) : (
                <p className="muted">{t('handover.waitingOther')}</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {offer.status === 'open' && (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'CANCEL_OFFER', offerId: offer.id })}
        >
          Cancel this offer
        </button>
      )}
    </>
  );
}
