import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ClaimResponse } from '@fedsa/contract';
import { useSession } from '../../auth/context';
import { isApiError, useData, useLoad } from '../../data';
import { errorKey, LoadState, PendingButton, useToast } from '../../components/feedback';
import { OfferPhoto } from '../../components/OfferPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { Banner, Detail, DetailList, PageHead } from '../../components/ui';
import { useT } from '../../i18n/useT';
import { formatKg, formatWhen, hasPassed, mealsFromKg } from '../../lib/format';
import { distanceKm } from '../../lib/org';
import { useNow } from '../../lib/useNow';
import '../shared/Detail.css';
import './Recipient.css';

/** route state for `MyClaims`. the claim response is the only place the donor's address arrives */
export interface ClaimedState {
  claimed: ClaimResponse;
}

export function ClaimConfirm() {
  const { offerId = '' } = useParams();
  const { organisation } = useSession();
  const { offers } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const now = useNow();
  const detail = useLoad(() => offers.get(offerId), [offers, offerId]);
  const recipient = organisation?.type === 'recipient' ? organisation : null;

  const [needsTransport, setNeedsTransport] = useState(recipient ? !recipient.hasTransport : false);
  const [pending, setPending] = useState(false);
  const [lost, setLost] = useState(false);

  async function claim() {
    setPending(true);
    try {
      const claimed = await offers.claim(offerId, { transportNeeded: needsTransport });
      toast.success(t('claim.done'));
      navigate('/recipient/claims', { state: { claimed } satisfies ClaimedState });
    } catch (error) {
      if (isApiError(error, 'OFFER_UNAVAILABLE')) setLost(true);
      else toast.error(t(errorKey(error)));
    } finally {
      setPending(false);
    }
  }

  const back = (
    <Link to={`/recipient/offers/${offerId}`} className="btn btn--ghost detail__back">
      <Icon name="back" size={18} />
      {t('common.back')}
    </Link>
  );

  if (lost) {
    return (
      <>
        <Banner tone="warn" title={t('error.offerUnavailable')}>
          {t('claim.lostBody')}
        </Banner>
        <Link to="/recipient" className="btn btn--primary">
          {t('claim.backToFeed')}
        </Link>
      </>
    );
  }

  return (
    <div className="claim-confirm">
      {back}

      <LoadState result={detail}>
        {({ offer, claim: held }) => {
          if (held?.status === 'active') {
            return (
              <Banner tone="good" title={t('detail.yours')}>
                <Link to="/recipient/claims">{t('detail.seeClaims')}</Link>.
              </Banner>
            );
          }
          if (offer.status !== 'open' || hasPassed(offer.collectionDeadline, new Date(now))) {
            return (
              <Banner
                tone="warn"
                title={offer.status === 'claimed' ? t('claim.taken') : t('claim.notAvailable')}
              >
                <Link to="/recipient">{t('claim.backToFeed')}</Link>.
              </Banner>
            );
          }

          return (
            <>
              <PageHead title={t('claim.confirmTitle')} />

              <div className="summary-strip">
                <div className="summary-strip__photo">
                  <OfferPhoto photos={offer.photos} alt={offer.title} />
                </div>
                <div className="summary-strip__text">
                  <strong>{offer.title}</strong>
                  <span>
                    {formatKg(offer.offeredQuantityKg)} ·{' '}
                    {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')} {t('offer.meals')}
                  </span>
                  <span>
                    {offer.donor.name}, {offer.donor.suburb}
                  </span>
                </div>
              </div>

              <div className="claim-confirm__lock">
                <Icon name="shield" size={20} />
                <span>{t('claim.locks')}</span>
              </div>

              <DetailList>
                <Detail label={t('offer.collectBy')}>
                  {formatWhen(offer.collectionDeadline)}
                  <div>
                    <Countdown deadline={offer.collectionDeadline} showClock={false} />
                  </div>
                </Detail>
                {recipient && (
                  <Detail label={t('claim.distance')}>
                    {distanceKm(recipient.location, offer.donor.location)} km
                  </Detail>
                )}
              </DetailList>

              <hr className="divider" style={{ margin: 'var(--s-5) 0' }} />

              <fieldset className="field">
                <legend className="field__label">{t('claim.howCollect')}</legend>
                <div className="stack stack--tight">
                  <label className="toggle">
                    <input
                      type="radio"
                      name="transport"
                      checked={!needsTransport}
                      onChange={() => setNeedsTransport(false)}
                    />
                    <span className="toggle__text">
                      {t('claim.haveTransport')}
                      <small>{t('claim.haveTransportHint')}</small>
                    </span>
                  </label>
                  <label className="toggle">
                    <input
                      type="radio"
                      name="transport"
                      checked={needsTransport}
                      onChange={() => setNeedsTransport(true)}
                    />
                    <span className="toggle__text">
                      {t('claim.needTransport')}
                      <small>{t('claim.needTransportHint')}</small>
                    </span>
                  </label>
                </div>
                {recipient && !recipient.hasTransport && (
                  <span className="field__hint">{t('claim.noVehicleHint')}</span>
                )}
              </fieldset>

              <div className="form-screen__actions">
                <Link to={`/recipient/offers/${offer.id}`} className="btn btn--secondary">
                  {t('claim.cancel')}
                </Link>
                <PendingButton
                  className="btn btn--go btn--lg"
                  pending={pending}
                  pendingLabel={t('claim.claiming')}
                  onClick={() => void claim()}
                >
                  <Icon name="check" size={20} />
                  {t('claim.confirm')}
                </PendingButton>
              </div>
            </>
          );
        }}
      </LoadState>
    </div>
  );
}
