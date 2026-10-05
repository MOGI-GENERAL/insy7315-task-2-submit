import { useState } from 'react';
import {
  DispatchRequest,
  type ClaimListItem,
  type Collection,
  type Organisation,
} from '@fedsa/contract';
import { isApiError, useData, useLoad } from '../../data';
import {
  ConfirmDialog,
  Empty,
  errorKey,
  LoadState,
  PendingButton,
  useToast,
} from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import { Countdown } from '../../components/Countdown';
import { Icon } from '../../components/Icon';
import { OfferPhoto } from '../../components/OfferPhoto';
import { PageHead, Section } from '../../components/ui';
import { useT } from '../../i18n/useT';
import { formatKg, formatWhen } from '../../lib/format';
import { localInputToIso, toLocalInput } from '../../lib/localTime';
import './Coordinator.css';

/** the donor and recipient are loaded only for a claim that still needs a driver */
interface Row {
  claim: ClaimListItem;
  collection: Collection | null;
  donor: Organisation | null;
  recipient: Organisation | null;
}

interface Values {
  driverName: string;
  driverPhone: string;
  /** `datetime-local` value, in the phone's time zone */
  scheduledFor: string;
}

const requestSchema: Validator<DispatchRequest> = {
  safeParse: (v) => {
    const values = v as Values;
    return DispatchRequest.safeParse({
      driverName: values.driverName,
      driverPhone: values.driverPhone.replace(/\s+/g, ''),
      scheduledFor: localInputToIso(values.scheduledFor),
    });
  },
};

const deadlineTime = new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const address = (org: Organisation) => `${org.addressLine}, ${org.suburb}`;

/** the text the API sends, word for word */
function driverText(row: Row) {
  const { offer } = row.claim;
  const { donor, recipient } = row;
  if (!donor || !recipient) return '';
  const deadline = deadlineTime.format(new Date(offer.collectionDeadline));
  return `FEDSA: Collection ${offer.reference}. Collect from ${address(donor)} (${donor.contactName}, ${donor.contactPhone}) by ${deadline}. Deliver to ${address(recipient)}.`;
}

type Closing = { row: Row & { collection: Collection }; status: 'completed' | 'cancelled' };

export function Dispatch() {
  const { claims, offers, organisations } = useData();
  const t = useT();
  const toast = useToast();
  const [closing, setClosing] = useState<Closing | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useLoad(async (): Promise<Row[]> => {
    const { items } = await claims.list({ status: 'active' });
    return Promise.all(
      items
        .filter((claim) => claim.transportNeeded)
        .map(async (claim) => {
          const { collection } = await offers.get(claim.offerId);
          if (collection) return { claim, collection, donor: null, recipient: null };
          const [donor, recipient] = await Promise.all([
            organisations.get(claim.offer.donorOrganisationId),
            organisations.get(claim.recipientOrganisationId),
          ]);
          return {
            claim,
            collection: null,
            donor: donor.organisation,
            recipient: recipient.organisation,
          };
        }),
    );
  }, [claims, offers, organisations]);

  async function close() {
    if (!closing) return;
    setBusy(true);
    try {
      await claims.updateCollection(closing.row.collection.id, { status: closing.status });
      toast.success(
        t(closing.status === 'completed' ? 'dispatch.collected' : 'dispatch.driverCancelled'),
      );
    } catch (error) {
      toast.error(t(errorKey(error)));
      // invalid state means the collection was closed elsewhere. reload shows it
      if (!isApiError(error, 'INVALID_STATE')) return;
    } finally {
      setBusy(false);
      setClosing(null);
    }
    await rows.reload();
  }

  return (
    <>
      <PageHead title={t('dispatch.title')} lead={t('dispatch.lead')} />

      <LoadState result={rows}>
        {(all) => {
          const waiting = all.filter((row) => !row.collection);
          const arranged = all.filter(
            (row): row is Row & { collection: Collection } =>
              row.collection?.status === 'dispatched',
          );

          return (
            <>
              <Section title={t('dispatch.waitingTitle')} count={waiting.length}>
                {waiting.length === 0 ? (
                  <Empty
                    icon="truck"
                    title={t('dispatch.noneWaitingTitle')}
                    body={t('dispatch.noneWaitingBody')}
                  />
                ) : (
                  waiting.map((row) => (
                    <DispatchCard key={row.claim.id} row={row} onSent={rows.reload} />
                  ))
                )}
              </Section>

              {arranged.length > 0 && (
                <Section title={t('dispatch.arrangedTitle')} count={arranged.length}>
                  <div className="table-scroll">
                    <table className="table">
                      <caption className="sr-only">{t('dispatch.tableCaption')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('dispatch.colOffer')}</th>
                          <th scope="col">{t('dispatch.colDriver')}</th>
                          <th scope="col">{t('dispatch.colRoute')}</th>
                          <th scope="col">{t('dispatch.colPickup')}</th>
                          <th scope="col">{t('dispatch.colActions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arranged.map((row) => {
                          const { claim, collection } = row;
                          return (
                            <tr key={claim.id}>
                              <td>
                                <strong>{claim.offer.reference}</strong>
                                <div className="muted">{claim.offer.title}</div>
                              </td>
                              <td>
                                {collection.driverName}
                                <div className="muted">{collection.driverPhone}</div>
                              </td>
                              <td>
                                {t('dispatch.routeTo')
                                  .replace('{from}', claim.offer.donor.suburb)
                                  .replace('{to}', claim.recipient.suburb)}
                              </td>
                              <td>
                                {collection.scheduledFor
                                  ? formatWhen(collection.scheduledFor)
                                  : formatWhen(collection.dispatchedAt)}
                              </td>
                              <td>
                                <div className="dispatch-actions">
                                  <button
                                    type="button"
                                    className="btn btn--go"
                                    onClick={() => setClosing({ row, status: 'completed' })}
                                  >
                                    {t('dispatch.markCollected')}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--secondary"
                                    onClick={() => setClosing({ row, status: 'cancelled' })}
                                  >
                                    {t('dispatch.cancelDriver')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}
            </>
          );
        }}
      </LoadState>

      <ConfirmDialog
        open={closing !== null}
        title={(closing?.status === 'cancelled'
          ? t('dispatch.cancelDriverTitle')
          : t('dispatch.markCollectedTitle')
        ).replace('{reference}', closing?.row.claim.offer.reference ?? '')}
        confirmLabel={
          closing?.status === 'cancelled' ? t('dispatch.cancelDriver') : t('dispatch.markCollected')
        }
        cancelLabel={closing?.status === 'cancelled' ? t('dispatch.keepDriver') : undefined}
        tone={closing?.status === 'cancelled' ? 'danger' : 'go'}
        busy={busy}
        onConfirm={() => void close()}
        onCancel={() => setClosing(null)}
      >
        {(closing?.status === 'cancelled'
          ? t('dispatch.cancelDriverBody')
          : t('dispatch.markCollectedBody')
        ).replace('{name}', closing?.row.collection.driverName ?? '')}
      </ConfirmDialog>
    </>
  );
}

function DispatchCard({ row, onSent }: { row: Row; onSent: () => Promise<void> }) {
  const { claims } = useData();
  const t = useT();
  const toast = useToast();
  const { claim } = row;
  const { offer } = claim;
  const [pendingRequest, setPendingRequest] = useState<DispatchRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [soon] = useState(() => toLocalInput(new Date(Date.now() + 30 * 60_000)));

  const form = useForm<Values, DispatchRequest>({
    initial: { driverName: '', driverPhone: '', scheduledFor: soon },
    schema: requestSchema,
    // the dialog sends it, once the coordinator has read the text
    onSubmit: (request) => setPendingRequest(request),
  });

  async function send() {
    if (!pendingRequest) return;
    setBusy(true);
    try {
      await claims.dispatch(claim.id, pendingRequest);
      toast.success(t('dispatch.sent'));
    } catch (error) {
      toast.error(t(errorKey(error)));
      // invalid state means the claim changed under us. reload shows it
      if (!isApiError(error, 'INVALID_STATE')) return;
    } finally {
      setBusy(false);
      setPendingRequest(null);
    }
    await onSent();
  }

  const { driverName, driverPhone } = form.values;

  return (
    <div className="dispatch-card">
      <div className="dispatch-card__head">
        <div className="dispatch-card__photo">
          <OfferPhoto photos={offer.photos} alt={offer.title} />
        </div>
        <div className="dispatch-card__who">
          <strong>{offer.title}</strong>
          <span className="muted">
            {offer.reference} · {formatKg(offer.offeredQuantityKg)}
          </span>
          <span className="dispatch-card__route">
            <Icon name="pin" size={16} />
            {offer.donor.suburb}
            <Icon name="forward" size={14} />
            {claim.recipient.suburb}
          </span>
          <span className="dispatch-card__route">
            <Countdown deadline={offer.collectionDeadline} />
          </span>
        </div>
      </div>

      <form className="dispatch-card__body" {...form.formProps}>
        <FormError form={form} />

        <Field form={form} name="driverName" label={t('dispatch.driverName')}>
          {(props) => <input {...props} className="input" autoComplete="off" />}
        </Field>

        <Field
          form={form}
          name="driverPhone"
          label={t('dispatch.driverPhone')}
          hint={t('dispatch.phoneHint')}
        >
          {(props) => (
            <input {...props} className="input" type="tel" inputMode="tel" autoComplete="off" />
          )}
        </Field>

        <Field form={form} name="scheduledFor" label={t('dispatch.scheduledFor')}>
          {(props) => <input {...props} className="input" type="datetime-local" />}
        </Field>

        <span className="field__hint">{t('dispatch.driverHint')}</span>

        <div className="sms-preview">
          <span className="sms-preview__label">
            <Icon name="phone" size={14} />
            {driverPhone.trim()
              ? t('dispatch.smsTo').replace('{phone}', driverPhone.trim())
              : t('dispatch.smsToDriver')}
          </span>
          <div className="sms-preview__bubble">{driverText(row)}</div>
        </div>

        <PendingButton
          type="submit"
          className="btn btn--go btn--block"
          pending={form.pending}
          pendingLabel={t('dispatch.sending')}
        >
          <Icon name="truck" size={20} />
          {t('dispatch.send')}
        </PendingButton>
      </form>

      <ConfirmDialog
        open={pendingRequest !== null}
        title={t('dispatch.confirmTitle').replace('{name}', driverName.trim())}
        confirmLabel={t('dispatch.confirmSend')}
        tone="go"
        busy={busy}
        onConfirm={() => void send()}
        onCancel={() => setPendingRequest(null)}
      >
        <p>
          {t('dispatch.confirmBody')
            .replace('{name}', driverName.trim())
            .replace('{phone}', pendingRequest?.driverPhone ?? '')}
        </p>
        <p className="muted">{driverText(row)}</p>
      </ConfirmDialog>
    </div>
  );
}
