import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  RecipientConfirmRequest,
  type Condition,
  type Handover,
  type Offer,
} from '@fedsa/contract';
import { isApiError, useData, useLoad } from '../../data';
import {
  ConfirmDialog,
  errorKey,
  LoadState,
  PendingButton,
  useToast,
} from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import { Icon } from '../../components/Icon';
import { OfferPhoto } from '../../components/OfferPhoto';
import { Banner, PageHead } from '../../components/ui';
import type { StringKey } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { formatDateTime, formatKg } from '../../lib/format';
import '../shared/Detail.css';
import './Recipient.css';

const conditions: Condition[] = ['good', 'acceptable', 'problem'];

const conditionKey: Record<Condition, StringKey> = {
  good: 'handover.conditionGood',
  acceptable: 'handover.conditionAcceptable',
  problem: 'handover.conditionPoor',
};

interface Values {
  conditionOnReceipt: Condition;
  conditionNotes: string;
}

const schema: Validator<RecipientConfirmRequest> = {
  safeParse: (v) => {
    const values = v as Values;
    return RecipientConfirmRequest.safeParse({
      conditionOnReceipt: values.conditionOnReceipt,
      conditionNotes: values.conditionNotes.trim() || undefined,
    });
  },
};

export function RecipientHandover() {
  const { offerId = '' } = useParams();
  const { offers } = useData();
  const t = useT();
  const detail = useLoad(() => offers.get(offerId), [offers, offerId]);
  const claimsLink = (
    <Link to="/recipient/claims" className="btn btn--secondary">
      {t('claims.title')}
    </Link>
  );

  return (
    <LoadState result={detail}>
      {({ offer, claim, handover }) => {
        if (handover?.recipientConfirmedAt) {
          return (
            <>
              <Banner tone="good" title={t('handover.receiptRecorded')}>
                {t('handover.receiptDone')
                  .replace('{kg}', formatKg(handover.collectedQuantityKg))
                  .replace('{when}', formatDateTime(handover.recipientConfirmedAt))}
              </Banner>
              {claimsLink}
            </>
          );
        }
        if (claim?.status !== 'active') {
          return (
            <>
              <Banner tone="warn" title={t('handover.notReady')}>
                {t('handover.notReadyBody')}
              </Banner>
              {claimsLink}
            </>
          );
        }
        if (!handover) {
          return (
            <>
              <Banner tone="info" title={t('handover.waitingDonor')}>
                {t('handover.waitingDonorWhy')}
              </Banner>
              {claimsLink}
            </>
          );
        }
        return <ReceiptForm offer={offer} handover={handover} reload={detail.reload} />;
      }}
    </LoadState>
  );
}

function ReceiptForm({
  offer,
  handover,
  reload,
}: {
  offer: Offer;
  handover: Handover;
  reload: () => Promise<unknown>;
}) {
  const { handovers } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const [asking, setAsking] = useState(false);
  // the dialog resubmits the form, which keeps server errors on the fields
  const confirmed = useRef(false);

  const form = useForm<Values, RecipientConfirmRequest>({
    initial: { conditionOnReceipt: 'good', conditionNotes: '' },
    schema,
    onSubmit: async (body) => {
      if (!confirmed.current) {
        setAsking(true);
        return;
      }
      confirmed.current = false;
      try {
        await handovers.recipientConfirm(offer.id, body);
        toast.success(t('handover.receiptRecorded'));
        navigate('/recipient/claims');
      } catch (error) {
        if (!isApiError(error, 'INVALID_STATE')) throw error;
        toast.error(t(errorKey(error)));
        await reload();
      } finally {
        setAsking(false);
      }
    },
  });

  const condition = form.values.conditionOnReceipt;
  const photos = handover.donorPhotoThumbUrl ? [{ thumbUrl: handover.donorPhotoThumbUrl }] : [];

  return (
    <form className="form-screen" {...form.formProps}>
      <Link to={`/recipient/offers/${offer.id}`} className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <PageHead title={t('handover.title')} lead={t('handover.recipientPrompt')} />

      <div className="summary-strip">
        <div className="summary-strip__photo">
          <OfferPhoto
            photos={photos.length ? photos : offer.photos}
            alt={t('handover.donorPhoto')}
          />
        </div>
        <div className="summary-strip__text">
          <strong>{offer.title}</strong>
          <span>
            {offer.reference} · {offer.donor.name}
          </span>
          <span>
            {t('handover.donorRecordedAt')
              .replace('{kg}', formatKg(handover.collectedQuantityKg))
              .replace('{when}', formatDateTime(handover.donorConfirmedAt))}
          </span>
        </div>
      </div>

      <FormError form={form} />

      <fieldset className="field">
        <legend className="field__label">{t('handover.condition')}</legend>
        <div className="choices">
          {conditions.map((c) => (
            <label key={c} className="choice">
              <input
                type="radio"
                name="conditionOnReceipt"
                value={c}
                checked={condition === c}
                onChange={() => form.set('conditionOnReceipt', c)}
              />
              <span>{t(conditionKey[c])}</span>
            </label>
          ))}
        </div>
        {condition === 'problem' && (
          <span className="field__hint">{t('handover.conditionPoorHint')}</span>
        )}
      </fieldset>

      <Field
        form={form}
        name="conditionNotes"
        label={t('handover.note')}
        hint={t('handover.lessArrived')}
        optional={condition !== 'problem'}
      >
        {(props) => <textarea {...props} className="textarea" />}
      </Field>

      <PendingButton
        type="submit"
        className="btn btn--go btn--lg btn--block"
        pending={form.pending}
        pendingLabel={t('handover.confirmReceipt')}
      >
        <Icon name="check" size={20} />
        {t('handover.confirmReceipt')}
      </PendingButton>

      <ConfirmDialog
        open={asking}
        title={t('handover.recipientAsk')}
        confirmLabel={t('handover.confirmReceipt')}
        tone="go"
        busy={form.pending}
        onConfirm={() => {
          confirmed.current = true;
          form.formProps.ref.current?.requestSubmit();
        }}
        onCancel={() => setAsking(false)}
      >
        {t('handover.recipientAskBody').replace('{kg}', formatKg(handover.collectedQuantityKg))}
      </ConfirmDialog>
    </form>
  );
}
