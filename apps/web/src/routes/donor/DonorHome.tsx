import { Link } from 'react-router-dom';
import { useSession } from '../../auth/context';
import { useData, useLoad } from '../../data';
import { LoadState } from '../../components/feedback';
import { OfferCard } from '../../components/OfferCard';
import { Icon } from '../../components/Icon';
import { PageHead, Section, StatRow, StatTile, EmptyState } from '../../components/ui';
import { useT } from '../../i18n/useT';

/** a claim on one of these offers shows up without a reload */
const REFRESH_MS = 30_000;

export function DonorHome() {
  const { user, organisation } = useSession();
  const { offers } = useData();
  const t = useT();

  const page = useLoad(
    async () => {
      const mine = await offers.list({ view: 'mine' });
      const live = mine.items.filter((o) => o.status === 'open' || o.status === 'claimed');
      const claimed = live.filter((o) => o.status === 'claimed');
      const details = await Promise.all(claimed.map((o) => offers.get(o.id)));
      const claimedBy = new Map(details.map((d) => [d.offer.id, d.claim?.recipient.name ?? null]));
      const recent = mine.items
        .filter((o) => o.status === 'collected' || o.status === 'expired')
        .slice(0, 4);
      return { live, claimed, claimedBy, recent };
    },
    [offers],
    { refreshMs: REFRESH_MS },
  );

  return (
    <>
      <PageHead
        title={t('donor.greeting').replace('{name}', user.fullName.split(' ')[0])}
        lead={organisation ? `${organisation.name}, ${organisation.suburb}` : undefined}
      />

      <Link to="/donor/post" className="btn btn--primary btn--lg btn--block post-cta">
        <Icon name="plus" size={22} />
        {t('post.title')}
      </Link>

      <LoadState result={page}>
        {({ live, claimed, claimedBy, recent }) => (
          <>
            <StatRow>
              <StatTile
                icon="list"
                label={t('donor.liveOffers')}
                value={String(live.length)}
                note={t('donor.liveNote')}
              />
              <StatTile
                icon="clock"
                label={t('donor.waitingOnYou')}
                value={String(claimed.length)}
                note={t('donor.waitingNote')}
                tone={claimed.length > 0 ? 'warn' : 'neutral'}
              />
            </StatRow>

            {claimed.length > 0 && (
              <Section title={t('donor.confirmTitle')} lead={t('donor.confirmLead')}>
                <div className="offer-list">
                  {claimed.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      to={`/donor/offers/${offer.id}`}
                      footer={
                        <div className="row row--between row--wrap">
                          <span className="muted">
                            <Icon name="check-circle" size={15} /> {t('donor.claimedBy')}{' '}
                            {claimedBy.get(offer.id)}
                          </span>
                          <Link to={`/donor/offers/${offer.id}`} className="btn btn--go">
                            {t('handover.confirm')}
                          </Link>
                        </div>
                      }
                    />
                  ))}
                </div>
              </Section>
            )}

            <Section title={t('donor.liveTitle')} count={live.length}>
              {live.length === 0 ? (
                <EmptyState
                  icon="box"
                  title={t('donor.emptyTitle')}
                  body={t('donor.emptyBody')}
                  action={
                    <Link to="/donor/post" className="btn btn--primary">
                      {t('post.title')}
                    </Link>
                  }
                />
              ) : (
                <div className="offer-list offer-list--wide">
                  {live.map((offer) => {
                    const recipient = claimedBy.get(offer.id);
                    return (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        to={`/donor/offers/${offer.id}`}
                        footer={
                          recipient ? (
                            <span className="muted">
                              <Icon name="check" size={15} /> {t('donor.claimedBy')} {recipient}
                            </span>
                          ) : (
                            <span className="muted">
                              <Icon name="clock" size={15} /> {t('donor.waitingForClaim')}
                            </span>
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </Section>

            {recent.length > 0 && (
              <Section title={t('donor.recentTitle')}>
                <div className="offer-list offer-list--wide">
                  {recent.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      to={`/donor/offers/${offer.id}`}
                      footer={
                        offer.status === 'expired' ? (
                          <span className="muted">{t('donor.notTaken')}</span>
                        ) : undefined
                      }
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
