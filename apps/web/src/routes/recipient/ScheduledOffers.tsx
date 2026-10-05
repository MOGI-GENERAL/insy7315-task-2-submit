import { Link } from 'react-router-dom';
import type { Offer } from '@fedsa/contract';
import { useData, useLoad } from '../../data';
import { Empty, LoadState } from '../../components/feedback';
import { OfferCard } from '../../components/OfferCard';
import { Icon } from '../../components/Icon';
import { PageHead } from '../../components/ui';
import { useT } from '../../i18n/useT';
import { fill, useFormat } from '../../i18n/useFormat';
import { hasPassed } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import './Recipient.css';

/** the API lists newest posted first, but planning reads by the day food becomes available */
function byDay(offers: Offer[], dayLabel: (iso: string) => string) {
  const days = new Map<string, Offer[]>();
  const sorted = [...offers].sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
  for (const offer of sorted) {
    const day = dayLabel(offer.availableFrom);
    days.set(day, [...(days.get(day) ?? []), offer]);
  }
  return [...days.entries()];
}

export function ScheduledOffers() {
  const { offers } = useData();
  const t = useT();
  const format = useFormat();
  const now = useNow();
  const list = useLoad(() => offers.list({ view: 'scheduled' }), [offers]);

  return (
    <>
      <PageHead title={t('feed.scheduledTitle')} lead={t('scheduled.lead')} />

      <LoadState
        result={list}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <Empty
            icon="clock"
            title={t('feed.scheduledEmpty')}
            body={t('scheduled.emptyHint')}
            action={
              <Link to="/recipient" className="btn btn--primary">
                {t('nav.offers')}
              </Link>
            }
          />
        }
      >
        {({ items }) =>
          byDay(items, format.date).map(([day, dayOffers]) => (
            <section className="section" key={day}>
              <h2 className="row" style={{ gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
                <Icon name="clock" size={20} />
                {day}
              </h2>
              <div className="offer-list offer-list--wide">
                {dayOffers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    to={`/recipient/offers/${offer.id}`}
                    scheduled
                    fits
                    hideTiming
                    footer={
                      <div className="row row--between row--wrap">
                        <span className="muted">
                          {fill(t('scheduled.window'), {
                            from: format.when(offer.availableFrom),
                            to: format.when(offer.collectionDeadline),
                          })}
                        </span>
                        {hasPassed(offer.availableFrom, new Date(now)) ? (
                          <Link to={`/recipient/offers/${offer.id}/claim`} className="btn btn--go">
                            {t('claim.action')}
                          </Link>
                        ) : (
                          <span className="muted">{t('scheduled.notYet')}</span>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          ))
        }
      </LoadState>
    </>
  );
}
