import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Condition, Offer } from '@fedsa/contract';
import { isApiError, useData, useLoad } from '../../data';
import { ConfirmDialog, errorKey, LoadState, useToast } from '../../components/feedback';
import { OfferPhoto } from '../../components/OfferPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { ColdChainBadge, StatusBadge } from '../../components/StatusBadge';
import { Banner, Detail, DetailList, PageHead, Section } from '../../components/ui';
import type { StringKey } from '../../i18n/strings';
import { useT, categoryKey } from '../../i18n/useT';
import { formatDateTime, formatKg, formatWhen, mealsFromKg } from '../../lib/format';
import '../shared/Detail.css';

const conditionKey: Record<Condition, StringKey> = {
  good: 'handover.conditionGood',
  acceptable: 'handover.conditionAcceptable',
  problem: 'handover.conditionPoor',
};

export function DonorOfferDetail() {
  const { offerId = '' } = useParams();
  const { offers } = useData();
  const t = useT();
  const toast = useToast();
  const detail = useLoad(() => offers.get(offerId), [offers, offerId]);
  // `DonorHandover` passes the new offer in route state, as no GET returns it
  const remainder = (useLocation().state as { remainderOffer?: Offer | null } | null)
    ?.remainderOffer;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await offers.cancel(offerId, {});
      toast.success(t('offer.cancelled'));
    } catch (error) {
      toast.error(t(errorKey(error)));
      // invalid state means a claim landed first. reload shows it
      if (!isApiError(error, 'INVALID_STATE')) return;
    } finally {
      setBusy(false);
      setConfirming(false);
    }
    await detail.reload();
  }

  return (
    <>
      <Link to="/donor" className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <LoadState result={detail}>
        {({ offer, claim, collection, handover }) => {
          const claimed = claim?.status === 'active' ? claim : null;

          return (
            <>
              <PageHead
                title={offer.title}
                lead={`${offer.reference} · ${offer.donor.name}, ${offer.donor.suburb}`}
                actions={<StatusBadge status={offer.status} deadline={offer.collectionDeadline} />}
              />

              {remainder && (
                <Banner tone="info">
                  {t('handover.remainderPosted')
                    .replace('{kg}', formatKg(remainder.offeredQuantityKg))
                    .replace('{reference}', remainder.reference)}
                  . <Link to={`/donor/offers/${remainder.id}`}>{t('handover.viewRemainder')}</Link>.
                </Banner>
              )}

              {claimed && (
                <div className="claimed-alert">
                  <div className="claimed-alert__icon">
                    <Icon name="check-circle" size={28} />
                  </div>
                  <div className="claimed-alert__body">
                    <strong>
                      {t('donorDetail.claimedThis').replace('{name}', claimed.recipient.name)}
                    </strong>
                    <span>
                      {claimed.recipient.suburb} · {t('donorDetail.claimedAt')}{' '}
                      {formatWhen(claimed.claimedAt)}
                    </span>
                    <span className="claimed-alert__transport">
                      {collection ? (
                        <>
                          <Icon name="truck" size={16} />{' '}
                          {t('donorDetail.driverCollecting').replace(
                            '{name}',
                            collection.driverName,
                          )}
                        </>
                      ) : claimed.transportNeeded ? (
                        <>
                          <Icon name="clock" size={16} /> {t('donorDetail.arrangingDriver')}
                        </>
                      ) : (
                        <>
                          <Icon name="truck" size={16} /> {t('donorDetail.selfCollect')}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="detail__grid">
                <div className="card detail__media">
                  <OfferPhoto
                    photos={offer.photos}
                    alt={offer.title}
                    full
                    className="detail__photo"
                  />
                </div>

                <div className="panel">
                  <DetailList>
                    <Detail label={t('offer.quantity')}>
                      {formatKg(offer.offeredQuantityKg)}
                      <div className="muted">
                        {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')}{' '}
                        {t('offer.meals')}
                      </div>
                    </Detail>
                    <Detail label={t('offer.category')}>{t(categoryKey(offer.category))}</Detail>
                    <Detail label={t('offer.storage')}>
                      <ColdChainBadge coldChain={offer.coldChain} />
                    </Detail>
                    <Detail label={t('offer.availableFrom')}>
                      {formatWhen(offer.availableFrom)}
                    </Detail>
                    <Detail label={t('offer.collectBy')}>
                      {formatWhen(offer.collectionDeadline)}
                      {offer.status === 'open' && (
                        <div>
                          <Countdown deadline={offer.collectionDeadline} showClock={false} />
                        </div>
                      )}
                    </Detail>
                  </DetailList>

                  {offer.description && (
                    <>
                      <hr className="divider" />
                      <p className="detail__desc">{offer.description}</p>
                    </>
                  )}
                </div>
              </div>

              {handover && (
                <Section title={t('donorDetail.recordTitle')} lead={t('donorDetail.recordLead')}>
                  <div className="handover-pair">
                    <div className="handover-side" data-done="true">
                      <h3>
                        <Icon name="check-circle" size={18} />
                        {t('handover.donorConfirmed')}
                      </h3>
                      <DetailList>
                        <Detail label={t('donorDetail.weight')}>
                          {formatKg(handover.collectedQuantityKg)}
                        </Detail>
                        <Detail label={t('donorDetail.time')}>
                          {formatDateTime(handover.donorConfirmedAt)}
                        </Detail>
                      </DetailList>
                    </div>

                    <div
                      className="handover-side"
                      data-done={Boolean(handover.recipientConfirmedAt)}
                    >
                      <h3>
                        <Icon
                          name={handover.recipientConfirmedAt ? 'check-circle' : 'clock'}
                          size={18}
                        />
                        {t('handover.recipientConfirmed')}
                      </h3>
                      {handover.recipientConfirmedAt ? (
                        <DetailList>
                          {handover.conditionOnReceipt && (
                            <Detail label={t('handover.condition')}>
                              {t(conditionKey[handover.conditionOnReceipt])}
                              {handover.conditionNotes && (
                                <div className="muted">{handover.conditionNotes}</div>
                              )}
                            </Detail>
                          )}
                          <Detail label={t('donorDetail.time')}>
                            {formatDateTime(handover.recipientConfirmedAt)}
                          </Detail>
                        </DetailList>
                      ) : (
                        <p className="muted">{t('handover.waitingOther')}</p>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {offer.status === 'claimed' && !handover && (
                <Link
                  to={`/donor/offers/${offer.id}/handover`}
                  className="btn btn--go btn--lg btn--block"
                >
                  <Icon name="check" size={20} />
                  {t('handover.confirm')}
                </Link>
              )}

              {offer.status === 'open' && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setConfirming(true)}
                >
                  {t('offer.cancel')}
                </button>
              )}
            </>
          );
        }}
      </LoadState>

      <ConfirmDialog
        open={confirming}
        title={t('offer.cancelTitle')}
        confirmLabel={t('offer.cancelConfirm')}
        tone="danger"
        busy={busy}
        onConfirm={cancel}
        onCancel={() => setConfirming(false)}
      >
        {t('offer.cancelWhy')}
      </ConfirmDialog>
    </>
  );
}
