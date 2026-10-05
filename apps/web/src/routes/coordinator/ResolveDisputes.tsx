import { useState } from 'react';
import { ResolutionRequest, type HandoverListItem } from '@fedsa/contract';
import {
  ConfirmDialog,
  Empty,
  errorKey,
  LoadState,
  PendingButton,
  useToast,
} from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import { Icon } from '../../components/Icon';
import { OfferPhoto } from '../../components/OfferPhoto';
import { Detail, DetailList, PageHead } from '../../components/ui';
import { dataMode, isApiError, useData, useLoad } from '../../data';
import { useT } from '../../i18n/useT';
import { formatDateTime, formatKg, formatWhen } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import './Coordinator.css';

const reportedAt = (item: HandoverListItem) => item.recipientConfirmedAt ?? item.donorConfirmedAt;

export function ResolveDisputes() {
  const { handovers } = useData();
  const t = useT();
  const now = useNow();
  const [selectedId, setSelectedId] = useState('');

  const list = useLoad(async () => {
    const { items } = await handovers.list({ condition: 'problem', resolved: false });
    return [...items].sort((a, b) => reportedAt(a).localeCompare(reportedAt(b)));
  }, [handovers]);

  function age(item: HandoverListItem) {
    const hours = Math.floor((now - new Date(reportedAt(item)).getTime()) / 3_600_000);
    if (hours < 1) return t('disputes.ageUnderHour');
    if (hours < 24) return t('disputes.ageHours').replace('{n}', String(hours));
    return t('disputes.ageDays').replace('{n}', String(Math.floor(hours / 24)));
  }

  return (
    <>
      <LoadState
        result={list}
        isEmpty={(items) => items.length === 0}
        empty={
          <>
            <PageHead title={t('disputes.title')} />
            <Empty
              icon="check-circle"
              title={t('disputes.emptyTitle')}
              body={t('disputes.emptyBody')}
            />
          </>
        }
      >
        {(items) => {
          const selected = items.find((item) => item.id === selectedId) ?? items[0]!;
          return (
            <>
              <PageHead
                title={t('disputes.title')}
                lead={t('disputes.lead').replace('{n}', String(items.length))}
              />

              <div className="dispute-layout">
                <div>
                  <h2 className="sr-only">{t('disputes.queue')}</h2>
                  <ul className="dispute-queue">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={item.id === selected.id}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <span className="dispute-queue__ref">
                            <span>{item.offer.reference}</span>
                          </span>
                          <span className="dispute-queue__type">{t('disputes.reported')}</span>
                          <span className="dispute-queue__sub">
                            {item.offer.donor.name} · {item.recipient.name}
                          </span>
                          <span className="dispute-queue__sub">{age(item)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <DisputePanel key={selected.id} item={selected} onResolved={list.reload} />
              </div>
            </>
          );
        }}
      </LoadState>
    </>
  );
}

function DisputePanel({
  item,
  onResolved,
}: {
  item: HandoverListItem;
  onResolved: () => Promise<void>;
}) {
  const { handovers } = useData();
  const t = useT();
  const toast = useToast();
  const [pendingRequest, setPendingRequest] = useState<ResolutionRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm({
    initial: { resolutionNote: '' },
    schema: ResolutionRequest,
    // the dialog saves it, because a resolution is written once
    onSubmit: (request) => setPendingRequest(request),
  });

  async function resolve() {
    if (!pendingRequest) return;
    setBusy(true);
    try {
      await handovers.resolve(item.id, pendingRequest);
      toast.success(t('disputes.resolved'));
    } catch (error) {
      toast.error(t(errorKey(error)));
      // invalid state means another coordinator resolved it first. reload drops it
      if (!isApiError(error, 'INVALID_STATE')) return;
    } finally {
      setBusy(false);
      setPendingRequest(null);
    }
    await onResolved();
  }

  const { offer } = item;
  const photos = item.donorPhotoThumbUrl ? [{ thumbUrl: item.donorPhotoThumbUrl }] : [];

  return (
    <div className="panel">
      <div className="row row--between row--wrap">
        <div>
          <h2>{t('disputes.reported')}</h2>
          <p className="muted">
            {offer.reference} ·{' '}
            {t('disputes.reportedAt').replace('{when}', formatWhen(reportedAt(item)))}
          </p>
        </div>
        <span className="badge" data-tone="expiring">
          {t('disputes.open')}
        </span>
      </div>

      <p className="section__lead" style={{ marginTop: 'var(--s-3)' }}>
        {t('disputes.panelLead')}
      </p>

      <DetailList>
        <Detail label={t('disputes.offer')}>
          {offer.title}
          <div className="muted">
            {t('disputes.offered').replace('{kg}', formatKg(offer.offeredQuantityKg))}
          </div>
        </Detail>
        <Detail label={t('disputes.donor')}>
          {offer.donor.name}
          <div className="muted">{offer.donor.suburb}</div>
        </Detail>
        <Detail label={t('disputes.recipient')}>
          {item.recipient.name}
          <div className="muted">{item.recipient.suburb}</div>
        </Detail>
      </DetailList>

      <h3 style={{ marginTop: 'var(--s-5)' }}>{t('disputes.evidence')}</h3>

      <div className="evidence">
        <div className="evidence__side">
          <div className="evidence__head">
            <Icon name="check-circle" size={18} />
            {t('disputes.donorSide')}
          </div>
          {photos.length > 0 && (
            <>
              <OfferPhoto
                photos={photos}
                alt={t('disputes.photoAlt')}
                className="evidence__photo"
              />
              {dataMode() === 'http' && (
                <a href={`/api/handovers/${item.id}/photo`} target="_blank" rel="noreferrer">
                  {t('disputes.fullPhoto')}
                </a>
              )}
            </>
          )}
          <div className="evidence__facts">
            <div className="evidence__qty">{formatKg(item.collectedQuantityKg)}</div>
            <p className="muted">
              {t('disputes.confirmed').replace('{when}', formatDateTime(item.donorConfirmedAt))}
            </p>
          </div>
        </div>

        <div className="evidence__side" data-conflict={true}>
          <div className="evidence__head">
            <Icon name="alert" size={18} />
            {t('disputes.recipientSide')}
          </div>
          <div className="evidence__facts">
            <p className="muted">
              {t('disputes.confirmed').replace('{when}', formatDateTime(reportedAt(item)))} ·{' '}
              {t('disputes.conditionPoor')}
            </p>
            {item.conditionNotes && <p className="detail__desc">“{item.conditionNotes}”</p>}
          </div>
        </div>
      </div>

      <form {...form.formProps}>
        <FormError form={form} />
        <Field
          form={form}
          name="resolutionNote"
          label={t('disputes.noteLabel')}
          hint={t('disputes.noteHint')}
        >
          {(props) => (
            <textarea
              {...props}
              className="textarea"
              maxLength={1000}
              placeholder={t('disputes.notePlaceholder')}
            />
          )}
        </Field>

        <div className="resolution-actions">
          <PendingButton type="submit" pending={form.pending}>
            {t('disputes.record')}
          </PendingButton>
        </div>
      </form>

      <ConfirmDialog
        open={pendingRequest !== null}
        title={t('disputes.confirmTitle').replace('{reference}', offer.reference)}
        confirmLabel={t('disputes.confirmRecord')}
        tone="go"
        busy={busy}
        onConfirm={() => void resolve()}
        onCancel={() => setPendingRequest(null)}
      >
        <p>{t('disputes.confirmBody')}</p>
        <p className="muted">{pendingRequest?.resolutionNote}</p>
      </ConfirmDialog>
    </div>
  );
}
