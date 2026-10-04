/* RECIPIENT HANDOVER CONFIRMATION — CONDITION ONLY; A PROBLEM GOES TO A COORDINATOR */

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
import type { Condition } from '../../store/types';
import '../shared/Detail.css';
import './Recipient.css';

const conditions: Condition[] = ['good', 'acceptable', 'problem'];

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

  const [condition, setCondition] = useState<Condition>('good');
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
          You confirmed receipt of {formatKg(handover.collectedQuantityKg)} on{' '}
          {formatDateTime(handover.recipientConfirmedAt)}.
        </Banner>
        <Link to="/recipient/claims" className="btn btn--secondary">
          {t('claims.title')}
        </Link>
      </>
    );
  }

  if (!handover) {
    return (
      <>
        <Banner tone="info" title="Waiting for the donor">
          {donor?.name ?? 'The donor'} records the handover first, with the weight that left their
          premises. You can confirm receipt once they have.
        </Banner>
        <Link to="/recipient/claims" className="btn btn--secondary">
          {t('claims.title')}
        </Link>
      </>
    );
  }

  const needsNote = condition === 'problem' && note.trim() === '';

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (needsNote) return;
    dispatch({
      type: 'CONFIRM_HANDOVER_RECIPIENT',
      claimId: claim!.id,
      userId: user.id,
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
          <span>
            Donor recorded {formatKg(handover.collectedQuantityKg)} at{' '}
            {formatDateTime(handover.donorConfirmedAt)}
          </span>
        </div>
      </div>

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
        {condition === 'problem' && (
          <span className="field__hint">{t('handover.conditionPoorHint')}</span>
        )}
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor="recv-note">
          {t('handover.note')}{' '}
          {condition !== 'problem' && <span className="muted">({t('common.optional')})</span>}
        </label>
        <textarea
          id="recv-note"
          className="textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={touched && needsNote}
          aria-describedby="recv-note-hint"
        />
        <span className="field__hint" id="recv-note-hint">
          If less arrived than the donor recorded, choose Poor and say what arrived. A coordinator
          settles it with both sides.
        </span>
        {touched && needsNote && (
          <span className="field__error" role="alert">
            Say what was wrong, so the coordinator can follow it up.
          </span>
        )}
      </div>

      <button type="submit" className="btn btn--go btn--lg btn--block">
        <Icon name="check" size={20} />
        {t('handover.confirmReceipt')}
      </button>
    </form>
  );
}
