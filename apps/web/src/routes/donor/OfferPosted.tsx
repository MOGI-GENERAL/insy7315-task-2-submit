import { Link, Navigate, useLocation } from 'react-router-dom';
import type { PostOfferResponse } from '@fedsa/contract';
import { Icon } from '../../components/Icon';
import { OfferPhoto } from '../../components/OfferPhoto';
import { PushOptIn } from '../../components/PushOptIn';
import { Detail, DetailList } from '../../components/ui';
import { ColdChainBadge } from '../../components/StatusBadge';
import { Countdown } from '../../components/Countdown';
import { useT, categoryKey } from '../../i18n/useT';
import { formatKg, formatWhen, mealsFromKg } from '../../lib/format';
import './OfferPosted.css';

/** `notifiedCount` exists only in the post response, which `PostOffer` passes in route state */
export function OfferPosted() {
  const posted = useLocation().state as PostOfferResponse | null;
  const t = useT();

  if (!posted) return <Navigate to="/donor" replace />;
  const { offer, notifiedCount } = posted;

  return (
    <div className="posted">
      <div className="posted__tick">
        <Icon name="check" size={40} />
      </div>

      <h1>{t('post.posted')}</h1>
      <p className="posted__ref">{offer.reference}</p>

      <p className="posted__reach" role="status">
        <strong>{notifiedCount}</strong> {t('post.notified')}
      </p>

      <div className="card posted__card">
        <OfferPhoto photos={offer.photos} alt={offer.title} className="posted__photo" />
        <div className="card__body">
          <h2>{offer.title}</h2>
          <p className="muted">
            {formatKg(offer.offeredQuantityKg)} · {t(categoryKey(offer.category))} ·{' '}
            {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')} {t('offer.meals')}
          </p>
          <div className="row row--wrap posted__tags">
            <ColdChainBadge coldChain={offer.coldChain} />
          </div>
          <DetailList>
            <Detail label={t('offer.availableFrom')}>{formatWhen(offer.availableFrom)}</Detail>
            <Detail label={t('offer.collectBy')}>
              <Countdown deadline={offer.collectionDeadline} showClock={false} />
              <div className="muted">{formatWhen(offer.collectionDeadline)}</div>
            </Detail>
          </DetailList>
        </div>
      </div>

      <p className="posted__next">{t('post.whatNext')}</p>

      <PushOptIn afterAction />

      <div className="posted__actions">
        <Link to={`/donor/offers/${offer.id}`} className="btn btn--secondary btn--block">
          {t('post.viewOffer')}
        </Link>
        <Link to="/donor/post" className="btn btn--primary btn--block">
          <Icon name="plus" size={20} />
          {t('post.another')}
        </Link>
      </div>

      <Link to="/donor" className="btn btn--ghost posted__home">
        {t('post.home')}
      </Link>
    </div>
  );
}
