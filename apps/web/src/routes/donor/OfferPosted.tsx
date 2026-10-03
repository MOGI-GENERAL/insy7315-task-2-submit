/* POST CONFIRMATION — SHOWS NOTIFIED COUNT */

import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { FoodPhoto } from '../../components/FoodPhoto';
import { Detail, DetailList } from '../../components/ui';
import { ColdChainBadge } from '../../components/StatusBadge';
import { Countdown } from '../../components/Countdown';
import { useAppState, useCurrentOrg } from '../../store/context';
import { offersForDonor } from '../../store/selectors';
import { useT, categoryKey } from '../../i18n/useT';
import { formatKg, formatWhen, mealsFromKg } from '../../lib/format';
import './OfferPosted.css';

export function OfferPosted() {
  const state = useAppState();
  const org = useCurrentOrg()!;
  const t = useT();

  const offer = offersForDonor(state, org.id)[0];

  if (!offer) {
    return (
      <div className="posted">
        <p>Nothing posted yet.</p>
        <Link to="/donor/post" className="btn btn--primary">
          {t('post.title')}
        </Link>
      </div>
    );
  }

  /* DISPATCH LOG AS PROOF OF FAN-OUT */
  const notified = state.notifications.filter(
    (n) => n.kind === 'offer_posted' && n.href === `/recipient/offers/${offer.id}`,
  );
  const notifiedOrgs = new Set(
    notified.map((n) => state.users.find((u) => u.id === n.userId)?.organisationId).filter(Boolean),
  );

  return (
    <div className="posted">
      <div className="posted__tick">
        <Icon name="check" size={40} />
      </div>

      <h1>{t('post.posted')}</h1>
      <p className="posted__ref">{offer.reference}</p>

      <p className="posted__reach">
        <strong>{notifiedOrgs.size}</strong> {t('post.notified')}
      </p>

      <div className="card posted__card">
        <FoodPhoto photo={offer.photo} className="posted__photo" />
        <div className="card__body">
          <h2>{offer.title}</h2>
          <p className="muted">
            {formatKg(offer.offeredQuantityKg)} · {t(categoryKey(offer.category))} ·{' '}
            {mealsFromKg(offer.offeredQuantityKg).toLocaleString('en-ZA')} meals
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

      <p className="posted__next">
        You will be notified the moment somebody claims it. Nothing else is needed from you until
        then.
      </p>

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
        Back to home
      </Link>
    </div>
  );
}
