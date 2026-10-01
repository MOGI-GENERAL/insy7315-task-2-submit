/* DONOR-SIDE HANDOVER CONFIRMATION — RECIPIENT CONFIRMS SEPARATELY LATER */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FoodPhoto } from '../../components/FoodPhoto';
import { PhotoPicker } from '../../components/PhotoPicker';
import { Icon } from '../../components/Icon';
import { Banner, PageHead } from '../../components/ui';
import { useApp, useCurrentOrg, useCurrentUser } from '../../store/context';
import { claimById, handoverForClaim, offerById, orgById } from '../../store/selectors';
import { useT } from '../../i18n/useT';
import { formatKg } from '../../lib/format';
import '../shared/Detail.css';

export function DonorHandover() {
  const { claimId } = useParams();
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const org = useCurrentOrg()!;
  const navigate = useNavigate();
  const t = useT();

  const claim = claimById(state, claimId);
  const offer = claim ? offerById(state, claim.offerId) : undefined;
  const handover = claim ? handoverForClaim(state, claim.id) : undefined;
  const recipient = orgById(state, claim?.recipientOrganisationId);

  const [quantity, setQuantity] = useState(offer ? String(offer.offeredQuantityKg) : '');
  const [photo, setPhoto] = useState<string | null>(offer?.photo ?? 'mixed');
  const [touched, setTouched] = useState(false);

  if (!claim || !offer || offer.donorOrganisationId !== org.id) {
    return (
      <Banner tone="bad" title="Not found">
        That handover does not belong to {org.name}. <Link to="/donor">Back to your offers</Link>.
      </Banner>
    );
  }

  if (handover?.donorConfirmedAt) {
    return (
      <>
        <Banner tone="good" title={t('handover.done')}>
          You confirmed {formatKg(handover.donorQuantityKg ?? 0)} leaving your premises.{' '}
          {handover.recipientConfirmedAt
            ? 'The recipient has confirmed receipt, so the record is complete.'
            : t('handover.waitingOther') + '.'}
        </Banner>
        <Link to={`/donor/offers/${offer.id}`} className="btn btn--secondary">
          View the record
        </Link>
      </>
    );
  }

  const kg = Number(quantity);
  const valid = Number.isFinite(kg) && kg > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    dispatch({
      type: 'CONFIRM_HANDOVER_DONOR',
      claimId: claim!.id,
      userId: user.id,
      quantityKg: kg,
      photo,
    });
    navigate(`/donor/offers/${offer!.id}`);
  }

  return (
    <form className="form-screen" onSubmit={submit} noValidate>
      <Link to={`/donor/offers/${offer.id}`} className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <PageHead title={t('handover.title')} lead={t('handover.donorPrompt')} />

      <div className="summary-strip">
        <div className="summary-strip__photo">
          <FoodPhoto photo={offer.photo} />
        </div>
        <div className="summary-strip__text">
          <strong>{offer.title}</strong>
          <span>
            {offer.reference} · {formatKg(offer.offeredQuantityKg)} offered
          </span>
          <span>Collected by {recipient?.name}</span>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="handover-kg">
          {t('handover.quantity')}
        </label>
        <div className="qty">
          <input
            id="handover-kg"
            className="input"
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-describedby="handover-kg-hint"
            aria-invalid={touched && !valid}
          />
          <span className="qty__unit">kg</span>
        </div>
        <span className="field__hint" id="handover-kg-hint">
          Change it if less is going than you posted. The recipient confirms their own figure, and a
          disagreement is referred to a coordinator rather than averaged away.
        </span>
        {touched && !valid && (
          <span className="field__error" role="alert">
            Enter the weight actually handed over.
          </span>
        )}
      </div>

      <PhotoPicker
        value={photo}
        onChange={setPhoto}
        name="handover-photo"
        label={t('handover.photo')}
        hint={t('handover.photoWhy')}
      />

      <button type="submit" className="btn btn--go btn--lg btn--block">
        <Icon name="check" size={20} />
        {t('handover.confirm')}
      </button>
    </form>
  );
}
