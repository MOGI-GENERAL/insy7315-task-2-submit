import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, useLoad } from '../../data';
import { ConfirmDialog, errorKey, LoadState, useToast } from '../../components/feedback';
import { OfferPhoto } from '../../components/OfferPhoto';
import { Icon } from '../../components/Icon';
import { Countdown } from '../../components/Countdown';
import { Banner, PageHead } from '../../components/ui';
import { useT } from '../../i18n/useT';
import { formatKg, hasPassed } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import '../shared/Detail.css';
import './Recipient.css';

export function ReleaseClaim() {
  const { claimId = '' } = useParams();
  const { claims } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const now = useNow();

  // no route returns one claim, and the list has only this organisation's
  const list = useLoad(() => claims.list({}), [claims]);

  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function release() {
    setBusy(true);
    try {
      const trimmed = reason.trim();
      const { offer } = await claims.release(claimId, trimmed ? { reason: trimmed } : {});
      toast.success(t(offer.status === 'open' ? 'claim.released' : 'release.doneClosed'));
      navigate('/recipient/claims');
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const backToClaims = (
    <Link to="/recipient/claims" className="btn btn--secondary">
      {t('claim.backToClaims')}
    </Link>
  );

  return (
    <div className="claim-confirm">
      <Link to="/recipient/claims" className="btn btn--ghost detail__back">
        <Icon name="back" size={18} />
        {t('common.back')}
      </Link>

      <LoadState result={list}>
        {({ items }) => {
          const claim = items.find((c) => c.id === claimId);

          if (!claim) {
            return (
              <>
                <Banner tone="bad" title={t('claim.notFound')}>
                  {t('claim.notYours')}
                </Banner>
                {backToClaims}
              </>
            );
          }
          if (claim.status !== 'active') {
            const released = claim.status === 'released';
            return (
              <>
                <Banner tone="info" title={released ? t('claims.released') : undefined}>
                  {t(released ? 'claim.alreadyReleased' : 'release.notActive')}
                </Banner>
                {backToClaims}
              </>
            );
          }

          const { offer } = claim;
          const stillOpen = !hasPassed(offer.collectionDeadline, new Date(now));

          return (
            <>
              <PageHead title={t('claim.releaseTitle')} />

              <div className="summary-strip">
                <div className="summary-strip__photo">
                  <OfferPhoto photos={offer.photos} alt={offer.title} />
                </div>
                <div className="summary-strip__text">
                  <strong>{offer.title}</strong>
                  <span>
                    {offer.reference} · {formatKg(offer.offeredQuantityKg)}
                  </span>
                  <span>
                    {offer.donor.name}, {offer.donor.suburb}
                  </span>
                </div>
              </div>

              {stillOpen ? (
                <Banner tone="good" title={t('claim.backInCirculation')}>
                  {t('claim.releaseWhy')} <Countdown deadline={offer.collectionDeadline} />
                </Banner>
              ) : (
                <Banner tone="warn" title={t('claim.windowClosed')}>
                  {t('claim.windowClosedWhy')}
                </Banner>
              )}

              <div className="field">
                <label className="field__label" htmlFor="release-reason">
                  {t('claim.releaseReason')}
                </label>
                <textarea
                  id="release-reason"
                  className="textarea"
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('claim.releaseReasonExample')}
                  aria-describedby="release-reason-hint"
                />
                <span className="field__hint" id="release-reason-hint">
                  {t('claim.releaseReasonHint')}
                </span>
              </div>

              <div className="form-screen__actions">
                <Link to="/recipient/claims" className="btn btn--secondary">
                  {t('claim.cancel')}
                </Link>
                <button
                  type="button"
                  className="btn btn--danger btn--lg"
                  onClick={() => setOpen(true)}
                >
                  {t('claim.releaseConfirm')}
                </button>
              </div>

              <ConfirmDialog
                open={open}
                title={t('claim.releaseTitle')}
                confirmLabel={t('claim.releaseConfirm')}
                tone="danger"
                busy={busy}
                onConfirm={() => void release()}
                onCancel={() => setOpen(false)}
              >
                {t(stillOpen ? 'claim.releaseWhy' : 'claim.windowClosedWhy')}
              </ConfirmDialog>
            </>
          );
        }}
      </LoadState>
    </div>
  );
}
