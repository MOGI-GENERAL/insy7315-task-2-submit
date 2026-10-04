/* SCHEDULED OFFERS — FUTURE-DAY SURPLUS FOR MEAL PLANNING */

import { Link } from 'react-router-dom';
import { OfferCard } from '../../components/OfferCard';
import { toOffer } from '../../data/fake/mappers';
import { EmptyState, PageHead } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useAppState, useCurrentOrg } from '../../store/context';
import { scheduledOffers } from '../../store/selectors';
import { useT } from '../../i18n/useT';
import { formatWhen } from '../../lib/format';
import './Recipient.css';

export function ScheduledOffers() {
  const state = useAppState();
  const org = useCurrentOrg()!;
  const t = useT();

  const offers = scheduledOffers(state, org);

  /* GROUP BY AVAILABILITY DAY */
  const byDay = new Map<string, typeof offers>();
  for (const offer of offers) {
    const key = offer.availableFrom.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), offer]);
  }

  return (
    <>
      <PageHead
        title={t('feed.scheduledTitle')}
        lead="Surplus that donors already know about, available on a later day. Plan against it rather than waiting for the afternoon."
      />

      {offers.length === 0 ? (
        <EmptyState
          icon="clock"
          title={t('feed.scheduledEmpty')}
          body="Supermarkets and larger donors post a day ahead. Anything they schedule that you can store will appear here."
          action={
            <Link to="/recipient" className="btn btn--primary">
              {t('nav.offers')}
            </Link>
          }
        />
      ) : (
        [...byDay.entries()].map(([day, dayOffers]) => (
          <section className="section" key={day}>
            <h2 className="row" style={{ gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
              <Icon name="clock" size={20} />
              {formatWhen(dayOffers[0].availableFrom).split(' ')[0] === 'Tomorrow'
                ? 'Tomorrow'
                : new Date(day).toLocaleDateString('en-ZA', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
            </h2>
            <div className="offer-list offer-list--wide">
              {dayOffers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={toOffer(offer, state)}
                  to={`/recipient/offers/${offer.id}`}
                  scheduled
                  fits
                  footer={
                    <div className="row row--between row--wrap">
                      <span className="muted">
                        Collect between {formatWhen(offer.availableFrom)} and{' '}
                        {formatWhen(offer.collectionDeadline)}
                      </span>
                      <Link to={`/recipient/offers/${offer.id}/claim`} className="btn btn--go">
                        {t('claim.action')}
                      </Link>
                    </div>
                  }
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
