/* CLAIM CONFIRMATION — LOCKS OFFER, TRANSPORT TOGGLE, RACE-SAFE ON SUBMIT */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { Banner, Detail, DetailList, PageHead } from '../../components/ui';
import { useApp, useCurrentOrg, useCurrentUser } from '../../store/context';
import { activeClaimForOffer, checkEligibility, offerById, orgById } from '../../store/selectors';
import { useT } from '../../i18n/useT';
import { formatKg, formatWhen, mealsFromKg } from '../../lib/format';
import '../shared/Detail.css';
import './Recipient.css';

export function ClaimConfirm() {
  const { offerId } = useParams();
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const org = useCurrentOrg()!;
  const navigate = useNavigate();
  const t = useT();

  const offer = offerById(state, offerId);
  const [needsTransport, setNeedsTransport] = useState(!org.hasTransport);

  if (!offer) {
    return (
      <Banner tone="bad" title="Offer not found">
        <Link to="/recipient">Back to offers</Link>.
      </Banner>
    );
  }

  const donor = orgById(state, offer.donorOrganisationId);
  const fit = checkEligibility(org, offer);
  const taken = Boolean(activeClaimForOffer(state, offer.id));

  if (taken || offer.status !== 'open' || !fit.eligible) {
    return (
      <>
        <Banner tone="warn" title={taken ? t('claim.taken') : 'Not available'}>
          {taken
            ? 'Another organisation holds this offer now.'
            : fit.reasons.join('. ') || 'This offer is no longer open.'}
        </Banner>
        <Link to="/recipient" className="btn btn--secondary">
          {t('common.back')}
        </Link>
      </>
    );
  }

  function claim() {
    dispatch({
      type: 'CLAIM_OFFER',
      offerId: offer!.id,
      userId: user.id,
      needsTransport,
    });
    navigate('/recipient/claims');
  }

  return (
    <div className="claim-confirm">
      <Link to={`/recipient/offers/${offer.id}`} className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <PageHead title={t('claim.confirmTitle')} />

      <div className="summary-strip">
        <div className="summary-strip__photo">
          <FoodPhoto photo={offer.photo} />
        </div>
        <div className="summary-strip__text">
          <strong>{offer.title}</strong>
          <span>
            {formatKg(offer.offeredQuantityKg)} ·{' '}
            {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')} meals
          </span>
          <span>
            {donor?.name}, {donor?.suburb}
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
        <Detail label="Distance">{donor?.distanceKm} km from the FEDSA office</Detail>
      </DetailList>

      <hr className="divider" style={{ margin: 'var(--s-5) 0' }} />

      <fieldset className="field">
        <legend className="field__label">How will you collect it?</legend>
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
              <small>Nothing further is needed from FEDSA.</small>
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
        {!org.hasTransport && (
          <span className="field__hint">
            Your profile says you have no vehicle, so this is set for you. Change it if somebody can
            fetch it today.
          </span>
        )}
      </fieldset>

      <div className="form-screen__actions">
        <Link to={`/recipient/offers/${offer.id}`} className="btn btn--secondary">
          {t('claim.cancel')}
        </Link>
        <button type="button" className="btn btn--go btn--lg" onClick={claim}>
          <Icon name="check" size={20} />
          {t('claim.confirm')}
        </button>
      </div>
    </div>
  );
}
