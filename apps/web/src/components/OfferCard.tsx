/* OFFER CARD - shared across recipient/donor/coordinator views */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FoodPhoto } from './FoodPhoto';
import { Icon } from './Icon';
import { ColdChainBadge, StatusBadge } from './StatusBadge';
import { Countdown } from './Countdown';
import { useT, categoryKey } from '../i18n/useT';
import { formatKg, formatWhen, mealsFromKg } from '../lib/format';
import type { Offer, Organisation } from '../store/types';

export function OfferCard({
  offer,
  donor,
  // NO LINK TARGET -> renders as static block
  to,
  fits,
  scheduled,
  // SUPPRESS OWN TIMING LINE (caller's footer already shows it)
  hideTiming,
  footer,
}: {
  offer: Offer;
  donor?: Organisation;
  to?: string;
  fits?: boolean;
  scheduled?: boolean;
  hideTiming?: boolean;
  footer?: ReactNode;
}) {
  const t = useT();

  const body = (
    <>
      <FoodPhoto photo={offer.photo} className="offer-card__photo" />
      <div className="offer-card__body">
        <div className="row row--between offer-card__top">
          <span className="offer-card__ref">{offer.reference}</span>
          <StatusBadge status={offer.status} deadline={offer.collectionDeadline} />
        </div>

        <h3 className="offer-card__title">{offer.title}</h3>

        <p className="offer-card__meta">
          <strong>{formatKg(offer.offeredQuantityKg)}</strong>
          <span aria-hidden="true"> · </span>
          {t(categoryKey(offer.category))}
          {donor && (
            <>
              <span aria-hidden="true"> · </span>
              {donor.suburb}
            </>
          )}
        </p>

        <p className="offer-card__sub muted">
          {donor?.name}
          <span aria-hidden="true"> · </span>
          {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')} meals
        </p>

        <div className="row row--wrap offer-card__tags">
          <ColdChainBadge coldChain={offer.coldChain} />
          {fits && (
            <span className="badge" data-tone="collected">
              <Icon name="check" size={14} />
              {t('claim.fits')}
            </span>
          )}
        </div>

        {!hideTiming &&
          (scheduled ? (
            <p className="offer-card__when">
              <Icon name="clock" size={15} />
              {t('offer.availableFrom')} {formatWhen(offer.availableFrom)}
            </p>
          ) : (
            <Countdown deadline={offer.collectionDeadline} />
          ))}
      </div>
    </>
  );

  return (
    <article className="offer-card">
      {to ? (
        <Link to={to} className="offer-card__link">
          {body}
        </Link>
      ) : (
        <div className="offer-card__link offer-card__link--static">{body}</div>
      )}
      {footer && <div className="offer-card__footer">{footer}</div>}
    </article>
  );
}
