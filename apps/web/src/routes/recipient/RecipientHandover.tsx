/* RECIPIENT HANDOVER CONFIRMATION — QTY/CONDITION MISMATCH TRIGGERS DISPUTE */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Icon } from '../../components/Icon';
import { Banner, PageHead } from '../../components/ui';
import { useApp, useCurrentOrg, useCurrentUser } from '../../store/context';
import { claimById, handoverForClaim, offerById, orgById } from '../../store/selectors';
import { useT } from '../../i18n/useT';
import { formatDateTime, formatKg } from '../../lib/format';
import type { FoodCondition } from '../../store/types';
import '../shared/Detail.css';
import './Recipient.css';

const conditions: FoodCondition[] = ['good', 'acceptable', 'poor'];

export function RecipientHandover() {
  const { claimId } = useParams();
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const org = useCurrentOrg()!;
  const navigate = useNavigate();
  const t = useT();

  const claim = claimById(state, claimId);
  const offer = claim ? offerById(state, claim.offerId) : undefined;
  const handover = claim ? handoverForClaim(state, claim.id) : undefined;
  const donor = orgById(state, offer?.donorOrganisationId);

  const [quantity, setQuantity] = useState(
    handover?.donorQuantityKg != null
      ? String(handover.donorQuantityKg)
      : offer
        ? String(offer.offeredQuantityKg)
        : '',
  );
  const [condition, setCondition] = useState<FoodCondition>('good');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  if (!claim || !offer || claim.recipientOrganisationId !== org.id) {
    return (
      <Banner tone="bad" title="Not found">
        That handover does not belong to {org.name}.{' '}
        <Link to="/recipient/claims">Back to your claims</Link>.
      </Banner>
    );
  }

  if (handover?.recipientConfirmedAt) {
    return (
      <>
        <Banner tone="good" title={t('handover.done')}>
          You confirmed {formatKg(handover.recipientQuantityKg ?? 0)} received on{' '}
          {formatDateTime(handover.recipientConfirmedAt)}.
        </Banner>
        <Link to="/recipient/claims" className="btn btn--secondary">
          {t('claims.title')}
        </Link>
      </>
    );
  }

  const kg = Number(quantity);
  const valid = Number.isFinite(kg) && kg > 0;
  const donorKg = handover?.donorQuantityKg;
  const mismatch = donorKg != null && valid && Math.abs(donorKg - kg) > 2;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    dispatch({
      type: 'CONFIRM_HANDOVER_RECIPIENT',
      claimId: claim!.id,
      userId: user.id,
      quantityKg: kg,
      condition,
      note: note.trim(),
    });
    navigate('/recipient/claims');
  }

  return (
    <form className="form-screen" onSubmit={submit} noValidate>
      <Link to="/recipient/claims" className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <PageHead title={t('handover.title')} lead={t('handover.recipientPrompt')} />

      <div className="summary-strip">
        <div className="summary-strip__photo">
          <FoodPhoto photo={offer.photo} />
        </div>
        <div className="summary-strip__text">
          <strong>{offer.title}</strong>
          <span>
            {offer.reference} · {donor?.name}
          </span>
          {handover?.donorConfirmedAt && (
            <span>
              Donor recorded {formatKg(donorKg ?? 0)} at {formatDateTime(handover.donorConfirmedAt)}
            </span>
          )}
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="recv-kg">
          {t('handover.quantityReceived')}
        </label>
        <div className="qty">
          <input
            id="recv-kg"
            className="input"
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={touched && !valid}
            aria-describedby="recv-kg-hint"
          />
          <span className="qty__unit">kg</span>
        </div>
        <span className="field__hint" id="recv-kg-hint">
          Record what actually arrived, even if it differs from what was sent.
        </span>
        {touched && !valid && (
          <span className="field__error" role="alert">
            Enter the weight you received.
          </span>
        )}
      </div>

      {mismatch && (
        <Banner tone="warn" title="This does not match the donor's figure">
          The donor recorded {formatKg(donorKg!)} and you have entered {formatKg(kg)}. Confirming
          will open a dispute for a coordinator to settle, which is the right outcome: the figure
          feeds both the funder report and the donor's tax certificate.
        </Banner>
      )}

      <fieldset className="field">
        <legend className="field__label">{t('handover.condition')}</legend>
        <div className="choices">
          {conditions.map((c) => (
            <label key={c} className="choice">
              <input
                type="radio"
                name="condition"
                value={c}
                checked={condition === c}
                onChange={() => setCondition(c)}
              />
              <span>
                {c === 'good'
                  ? t('handover.conditionGood')
                  : c === 'acceptable'
                    ? t('handover.conditionAcceptable')
                    : t('handover.conditionPoor')}
              </span>
            </label>
          ))}
        </div>
        {condition === 'poor' && (
          <span className="field__hint">{t('handover.conditionPoorHint')}</span>
        )}
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor="recv-note">
          {t('handover.note')} <span className="muted">({t('common.optional')})</span>
        </label>
        <textarea
          id="recv-note"
          className="textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn--go btn--lg btn--block">
        <Icon name="check" size={20} />
        {t('handover.confirmReceipt')}
      </button>
    </form>
  );
}
