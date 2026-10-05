import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DonorConfirmFields, type Handover, type Offer } from '@fedsa/contract';
import { useData, useLoad } from '../../data';
import { ConfirmDialog, LoadState, PendingButton, useToast } from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import { Icon } from '../../components/Icon';
import { OfferPhoto } from '../../components/OfferPhoto';
import { PhotoCapture } from '../../components/PhotoCapture';
import { Banner, PageHead } from '../../components/ui';
import { useT } from '../../i18n/useT';
import { formatKg } from '../../lib/format';
import '../shared/Detail.css';

export function DonorHandover() {
  const { offerId = '' } = useParams();
  const { offers } = useData();
  const t = useT();
  const detail = useLoad(() => offers.get(offerId), [offers, offerId]);
  const back = (
    <Link to={`/donor/offers/${offerId}`} className="btn btn--ghost detail__back">
      <Icon name="back" size={18} />
      {t('common.back')}
    </Link>
  );

  return (
    <LoadState result={detail}>
      {({ offer, handover }) => {
        if (handover) return <Recorded offer={offer} handover={handover} />;
        if (offer.status !== 'claimed') {
          return (
            <>
              {back}
              <Banner tone="warn" title={t('handover.notReady')}>
                {t('handover.notReadyBody')}
              </Banner>
            </>
          );
        }
        return (
          <>
            {back}
            <HandoverForm offer={offer} />
          </>
        );
      }}
    </LoadState>
  );
}

function Recorded({ offer, handover }: { offer: Offer; handover: Handover }) {
  const t = useT();
  return (
    <>
      <Banner tone="good" title={t('handover.done')}>
        {t('handover.donorDone').replace('{kg}', formatKg(handover.collectedQuantityKg))}{' '}
        {handover.recipientConfirmedAt
          ? t('handover.recordComplete')
          : `${t('handover.waitingOther')}.`}
      </Banner>
      <Link to={`/donor/offers/${offer.id}`} className="btn btn--secondary">
        {t('handover.viewRecord')}
      </Link>
    </>
  );
}

function HandoverForm({ offer }: { offer: Offer }) {
  const { handovers } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const [photos, setPhotos] = useState<File[]>([]);
  const [asking, setAsking] = useState(false);
  // the dialog resubmits the form, which keeps server errors on the fields
  const confirmed = useRef(false);

  const form = useForm<{ collectedQuantityKg: number | undefined }, DonorConfirmFields>({
    initial: { collectedQuantityKg: offer.offeredQuantityKg },
    schema: DonorConfirmFields,
    onSubmit: async (fields) => {
      if (!confirmed.current) {
        setAsking(true);
        return;
      }
      confirmed.current = false;
      try {
        const { remainderOffer } = await handovers.donorConfirm(
          offer.id,
          fields,
          photos[0] ?? null,
        );
        toast.success(t('handover.recorded'));
        navigate(`/donor/offers/${offer.id}`, { state: { remainderOffer } });
      } finally {
        setAsking(false);
      }
    },
  });

  const entered = form.values.collectedQuantityKg;

  return (
    <form className="form-screen" {...form.formProps}>
      <PageHead title={t('handover.title')} lead={t('handover.donorPrompt')} />

      <div className="summary-strip">
        <div className="summary-strip__photo">
          <OfferPhoto photos={offer.photos} alt={offer.title} />
        </div>
        <div className="summary-strip__text">
          <strong>{offer.title}</strong>
          <span>
            {offer.reference} · {formatKg(offer.offeredQuantityKg)}
          </span>
        </div>
      </div>

      <FormError form={form} />

      <Field
        form={form}
        name="collectedQuantityKg"
        kind="number"
        label={t('handover.quantity')}
        hint={t('handover.donorHint')}
      >
        {(props) => (
          <div className="qty">
            <input
              {...props}
              className="input"
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.1"
            />
            <span className="qty__unit">kg</span>
          </div>
        )}
      </Field>

      <PhotoCapture
        files={photos}
        onChange={setPhotos}
        max={1}
        label={t('handover.photo')}
        hint={t('handover.photoWhy')}
      />

      <PendingButton
        type="submit"
        className="btn btn--go btn--lg btn--block"
        pending={form.pending}
        pendingLabel={t('handover.confirm')}
      >
        <Icon name="check" size={20} />
        {t('handover.confirm')}
      </PendingButton>

      <ConfirmDialog
        open={asking}
        title={t('handover.donorAsk')}
        confirmLabel={t('handover.confirm')}
        tone="go"
        busy={form.pending}
        onConfirm={() => {
          confirmed.current = true;
          form.formProps.ref.current?.requestSubmit();
        }}
        onCancel={() => setAsking(false)}
      >
        {t('handover.donorAskBody').replace('{kg}', formatKg(entered ?? 0))}
      </ConfirmDialog>
    </form>
  );
}
