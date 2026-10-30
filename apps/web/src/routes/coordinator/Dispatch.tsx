import { useState } from 'react';
import {
  DispatchRequest,
  type ClaimListItem,
  type Collection,
  type Organisation,
} from '@fedsa/contract';
import { isApiError, useData, useLoad } from '../../data';
import { ConfirmDialog, Empty, errorKey, LoadState, useToast } from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import { Countdown } from '../../components/Countdown';
import { Icon } from '../../components/Icon';
import { OfferPhoto } from '../../components/OfferPhoto';
import { PageHead, Section } from '../../components/ui';
import { useT } from '../../i18n/useT';
import { formatKg, formatWhen } from '../../lib/format';
import { localInputToIso, toLocalInput } from '../../lib/localTime';
import { emailLink, whatsAppLink } from '../../lib/share';
import { localised } from '../account/messages';
import './Coordinator.css';

interface Row {
  claim: ClaimListItem;
  collection: Collection | null;
  donor: Organisation;
  recipient: Organisation;
}

interface Sharing {
  name: string;
  phone: string;
  reference: string;
  text: string;
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
  const deadline = deadlineTime.format(new Date(offer.collectionDeadline));
  return `FEDSA: Collection ${offer.reference}. Collect from ${address(donor)} (${donor.contactName}, ${donor.contactPhone}) by ${deadline}. Deliver to ${address(recipient)}.`;
}

type Closing = { row: Row & { collection: Collection }; status: 'completed' | 'cancelled' };

export function Dispatch() {
  const { claims, offers, organisations } = useData();
  const t = useT();
  const toast = useToast();
  const [closing, setClosing] = useState<Closing | null>(null);
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useLoad(async (): Promise<Row[]> => {
    const { items } = await claims.list({ status: 'active' });
    return Promise.all(
      items
        .filter((claim) => claim.transportNeeded)
        .map(async (claim) => {
          const [{ collection }, donor, recipient] = await Promise.all([
            offers.get(claim.offerId),
            organisations.get(claim.offer.donorOrganisationId),
            organisations.get(claim.recipientOrganisationId),
          ]);
          return {
            claim,
            collection,
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
                                    onClick={() =>
                                      setSharing({
                                        name: collection.driverName,
                                        phone: collection.driverPhone,
                                        reference: claim.offer.reference,
                                        text: driverText(row),
                                      })
                                    }
                                  >
                                    {t('dispatch.shareAgain')}
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

      <ShareDialog sharing={sharing} onClose={() => setSharing(null)} />
    </>
  );
}

/** the driver's text from the coordinator's own WhatsApp or email, while SMS is not live */
function ShareDialog({ sharing, onClose }: { sharing: Sharing | null; onClose: () => void }) {
  const t = useT();
  const toast = useToast();

  async function copy() {
    if (!sharing) return;
    try {
      await navigator.clipboard.writeText(sharing.text);
      toast.success(t('dispatch.copied'));
    } catch {
      toast.error(t('error.internal'));
    }
  }

  return (
    <ConfirmDialog
      open={sharing !== null}
      title={t('dispatch.shareTitle').replace('{name}', sharing?.name ?? '')}
      confirmLabel={t('dispatch.shareWhatsapp')}
      cancelLabel={t('dispatch.shareDone')}
      tone="go"
      onConfirm={() => {
        if (sharing) window.open(whatsAppLink(sharing.phone, sharing.text), '_blank', 'noopener');
      }}
      onCancel={onClose}
    >
      <p>{t('dispatch.shareBody')}</p>
      <p className="muted">{sharing?.text}</p>
      <div className="share-actions">
        <a
          className="btn btn--secondary"
          href={
            sharing
              ? emailLink(
                  t('dispatch.emailSubject').replace('{reference}', sharing.reference),
                  sharing.text,
                )
              : undefined
          }
        >
          {t('dispatch.shareEmail')}
        </a>
        <button type="button" className="btn btn--secondary" onClick={() => void copy()}>
          {t('dispatch.shareCopy')}
        </button>
      </div>
    </ConfirmDialog>
  );
}

function DispatchCard({ row, onSent }: { row: Row; onSent: () => Promise<void> }) {
  const { claims } = useData();
  const t = useT();
  const toast = useToast();
  const { claim } = row;
  const { offer } = claim;
  const [soon] = useState(() => toLocalInput(new Date(Date.now() + 30 * 60_000)));

  const form = useForm<Values, DispatchRequest>({
    initial: { driverName: '', driverPhone: '', scheduledFor: soon },
    schema: localised(requestSchema, t),
    onSubmit: async (request) => {
      try {
        await claims.dispatch(claim.id, request);
        toast.success(t('dispatch.sent'));
      } catch (error) {
        toast.error(t(errorKey(error)));
        // invalid state means the claim changed under us. reload shows it
        if (!isApiError(error, 'INVALID_STATE')) return;
      }
      await onSent();
    },
  });

  /** runs in the click itself, because iOS refuses a new window or the clipboard once it has passed */
  function share(channel: 'whatsapp' | 'email' | 'copy') {
    const parsed = requestSchema.safeParse(form.values);
    // the submit that follows shows the field errors
    if (!parsed.success) return;
    const text = driverText(row);
    if (channel === 'whatsapp') {
      window.open(whatsAppLink(parsed.data.driverPhone, text), '_blank', 'noopener');
    } else if (channel === 'email') {
      window.location.href = emailLink(
        t('dispatch.emailSubject').replace('{reference}', offer.reference),
        text,
      );
    } else {
      navigator.clipboard.writeText(text).then(
        () => toast.success(t('dispatch.copied')),
        () => toast.error(t('error.internal')),
      );
    }
  }

  const { driverPhone } = form.values;

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

        <div className="share-actions">
          <button
            type="submit"
            className="btn btn--go"
            disabled={form.pending}
            onClick={() => share('whatsapp')}
          >
            {t('dispatch.shareWhatsapp')}
          </button>
          <button
            type="submit"
            className="btn btn--secondary"
            disabled={form.pending}
            onClick={() => share('copy')}
          >
            {t('dispatch.shareCopy')}
          </button>
          <button
            type="submit"
            className="btn btn--secondary"
            disabled={form.pending}
            onClick={() => share('email')}
          >
            {t('dispatch.shareEmail')}
          </button>
        </div>
      </form>
    </div>
  );
}
