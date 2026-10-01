/* RELEASE CLAIM — OPTIONAL REASON, RE-OPENS OFFER IF BEFORE DEADLINE */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { Banner, PageHead } from '../../components/ui';
import { Countdown } from '../../components/Countdown';
import { useApp, useCurrentOrg } from '../../store/context';
import { claimById, offerById, orgById } from '../../store/selectors';
import { useT } from '../../i18n/useT';
import { formatKg, hasPassed } from '../../lib/format';
import '../shared/Detail.css';
import './Recipient.css';

export function ReleaseClaim() {
  const { claimId } = useParams();
  const { state, dispatch } = useApp();
  const org = useCurrentOrg()!;
  const navigate = useNavigate();
  const t = useT();

  const [reason, setReason] = useState('');

  const claim = claimById(state, claimId);
  const offer = claim ? offerById(state, claim.offerId) : undefined;

  if (!claim || !offer || claim.recipientOrganisationId !== org.id) {
    return (
      <Banner tone="bad" title="Claim not found">
        That claim does not belong to {org.name}.{' '}
        <Link to="/recipient/claims">Back to your claims</Link>.
      </Banner>
    );
  }

  if (claim.releasedAt) {
    return (
      <>
        <Banner tone="info" title={t('claims.released')}>
          This claim was already released.
        </Banner>
        <Link to="/recipient/claims" className="btn btn--secondary">
          {t('claims.title')}
        </Link>
      </>
    );
  }

  const donor = orgById(state, offer.donorOrganisationId);
  const stillOpen = !hasPassed(offer.collectionDeadline);

  function release() {
    dispatch({ type: 'RELEASE_CLAIM', claimId: claim!.id, reason: reason.trim() });
    navigate('/recipient/claims');
  }

  return (
    <div className="claim-confirm">
      <Link to="/recipient/claims" className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <PageHead title={t('claim.releaseTitle')} />

      <div className="summary-strip">
        <div className="summary-strip__photo">
          <FoodPhoto photo={offer.photo} />
        </div>
        <div className="summary-strip__text">
          <strong>{offer.title}</strong>
          <span>
            {offer.reference} · {formatKg(offer.offeredQuantityKg)}
          </span>
          <span>
            {donor?.name}, {donor?.suburb}
          </span>
        </div>
      </div>

      {stillOpen ? (
        <Banner tone="good" title="The food goes back into circulation">
          {t('claim.releaseWhy')} <Countdown deadline={offer.collectionDeadline} />
        </Banner>
      ) : (
        <Banner tone="warn" title="The collection window has already closed">
          Releasing now records honestly what happened, but the offer cannot be re-offered. It will
          be counted as a collection that failed rather than a match that was never made.
        </Banner>
      )}

      <div className="field">
        <label className="field__label" htmlFor="release-reason">
          {t('claim.releaseReason')}
        </label>
        <textarea
          id="release-reason"
          className="textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="No transport today, freezer is full, staff are short"
          aria-describedby="release-reason-hint"
        />
        <span className="field__hint" id="release-reason-hint">
          Never required. It helps the coordinator spot a pattern, nothing more.
        </span>
      </div>

      <div className="form-screen__actions">
        <Link to="/recipient/claims" className="btn btn--secondary">
          {t('claim.cancel')}
        </Link>
        <button type="button" className="btn btn--danger btn--lg" onClick={release}>
          {t('claim.releaseConfirm')}
        </button>
      </div>
    </div>
  );
}
