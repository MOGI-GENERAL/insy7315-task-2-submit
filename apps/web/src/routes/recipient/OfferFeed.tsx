import { Link } from 'react-router-dom';
import { useSession } from '../../auth/context';
import { useData, useLoad } from '../../data';
import { Empty, LoadState } from '../../components/feedback';
import { OfferCard } from '../../components/OfferCard';
import { Icon } from '../../components/Icon';
import { PageHead, Section } from '../../components/ui';
import { useT } from '../../i18n/useT';
import './Recipient.css';

/** an offer someone else claims drops out without a reload */
const REFRESH_MS = 30_000;

export function OfferFeed() {
  const { organisation } = useSession();
  const { offers, claims } = useData();
  const t = useT();
  const recipient = organisation?.type === 'recipient' ? organisation : null;

  const page = useLoad(
    async () => {
      const [feed, scheduled, active] = await Promise.all([
        offers.list({ view: 'feed' }),
        offers.list({ view: 'scheduled' }),
        claims.list({ status: 'active' }),
      ]);
      return { feed: feed.items, scheduled: scheduled.items, activeClaims: active.items.length };
    },
    [offers, claims],
    { refreshMs: REFRESH_MS },
  );

  return (
    <>
      <PageHead
        title={t('feed.title')}
        lead={recipient ? `${recipient.name}, ${recipient.suburb}. ${t('feed.filtered')}` : undefined}
      />

      <LoadState result={page}>
        {({ feed, scheduled, activeClaims }) => (
          <>
            {activeClaims > 0 && (
              <Link to="/recipient/claims" className="feed__active">
                <Icon name="check-circle" size={20} />
                <span>
                  <strong>
                    {activeClaims} {t('feed.inProgress')}
                  </strong>
                  <span>{t('feed.inProgressHint')}</span>
                </span>
                <Icon name="forward" size={18} />
              </Link>
            )}

            <Section title={t('feed.availableNow')} count={feed.length}>
              {feed.length === 0 ? (
                <Empty icon="box" title={t('feed.empty')} />
              ) : (
                <div className="offer-list offer-list--wide">
                  {feed.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      to={`/recipient/offers/${offer.id}`}
                      fits
                      footer={
                        <div className="row row--between row--wrap">
                          <span className="muted">
                            <Icon name="pin" size={15} /> {offer.donor.suburb}
                            {recipient && !recipient.hasTransport && ` · ${t('feed.needDriver')}`}
                          </span>
                          <Link to={`/recipient/offers/${offer.id}/claim`} className="btn btn--go">
                            {t('claim.action')}
                          </Link>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </Section>

            {scheduled.length > 0 && (
              <Section
                title={t('feed.scheduledTitle')}
                count={scheduled.length}
                actions={
                  <Link to="/recipient/scheduled" className="btn btn--ghost">
                    {t('feed.seeAll')}
                  </Link>
                }
              >
                <div className="offer-list offer-list--wide">
                  {scheduled.slice(0, 2).map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      to={`/recipient/offers/${offer.id}`}
                      scheduled
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </LoadState>
    </>
  );
}
