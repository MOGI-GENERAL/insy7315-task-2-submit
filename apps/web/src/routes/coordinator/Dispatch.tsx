import { useEffect, useRef, useState } from 'react';
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
import { driverLink, mintDriverToken } from '../../lib/driverLink';
import { driverText } from '../../lib/driverText';
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
  collectionId: string;
  name: string;
  phone: string;
  reference: string;
  /** the link in `text`, which replaces the driver's current link on the first send */
  token: string;
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

const address = (org: Organisation) => `${org.addressLine}, ${org.suburb}`;

/** the text the API sends, word for word */
function textFor(row: Row, link: string) {
  const { offer } = row.claim;
  const { donor, recipient } = row;
  return driverText({
    reference: offer.reference,
    deadline: offer.collectionDeadline,
    pickupAddress: address(donor),
    contactName: donor.contactName,
    contactPhone: donor.contactPhone,
    dropOffAddress: address(recipient),
    link,
  });
}

/** minted in the click. the text on screen is the text that gets sent */
function sharingFor(row: Row & { collection: Collection }): Sharing {
  const token = mintDriverToken();
  return {
    collectionId: row.collection.id,
    name: row.collection.driverName,
    phone: row.collection.driverPhone,
    reference: row.claim.offer.reference,
    token,
    text: textFor(row, driverLink(window.location.origin, token)),
  };
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
                                    onClick={() => setSharing(sharingFor(row))}
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

      <ShareDialog
        sharing={sharing}
        onClose={() => setSharing(null)}
        onClosedElsewhere={() => void rows.reload()}
      />
    </>
  );
}

/** the driver's text from the coordinator's own WhatsApp or email, while SMS is not live */
function ShareDialog({
  sharing,
  onClose,
  onClosedElsewhere,
}: {
  sharing: Sharing | null;
  onClose: () => void;
  onClosedElsewhere: () => void;
}) {
  const { claims } = useData();
  const t = useT();
  const toast = useToast();
  const rotated = useRef(false);

  useEffect(() => {
    rotated.current = false;
  }, [sharing?.token]);

  /** the old link works until the first send, and closing the dialog unsent leaves it alone */
  function rotateOnce() {
    if (!sharing || rotated.current) return;
    rotated.current = true;
    claims.rotateDriverLink(sharing.collectionId, { driverToken: sharing.token }).catch((error) => {
      const closed = isApiError(error, 'INVALID_STATE');
      toast.error(t(closed ? 'dispatch.rotateClosed' : 'dispatch.rotateFailed'));
      onClose();
      if (closed) onClosedElsewhere();
    });
  }

  async function copy() {
    if (!sharing) return;
    try {
      await navigator.clipboard.writeText(sharing.text);
      rotateOnce();
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
        if (!sharing) return;
        window.open(whatsAppLink(sharing.phone, sharing.text), '_blank', 'noopener');
        rotateOnce();
      }}
      onCancel={onClose}
    >
      <p>{t('dispatch.shareBody')}</p>
      <p className="muted">{sharing?.text}</p>
      <div className="share-actions">
        <a
          className="btn btn--secondary"
          onClick={rotateOnce}
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
  // one link per card. a retry after a failure has to store the link already sent
  const token = useRef<string | null>(null);
  const posted = useRef(false);

  const form = useForm<Values, DispatchRequest>({
    initial: { driverName: '', driverPhone: '', scheduledFor: soon },
    schema: localised(requestSchema, t),
    onSubmit: async (request) => {
      try {
        const driverToken = (token.current ??= mintDriverToken());
        // a repeat of our own post that got through is not another coordinator's collection
        const retried = posted.current;
        posted.current = true;
        const { created } = await claims.dispatch(claim.id, { ...request, driverToken });
        if (created || retried) toast.success(t('dispatch.sent'));
        else toast.error(t('dispatch.alreadyArranged'));
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
    const link = driverLink(window.location.origin, (token.current ??= mintDriverToken()));
    const text = textFor(row, link);
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
          <div className="sms-preview__bubble">
            {textFor(row, driverLink(window.location.origin, '…'))}
          </div>
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
