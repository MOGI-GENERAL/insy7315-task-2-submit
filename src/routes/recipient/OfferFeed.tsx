/* RECIPIENT FEED — ELIGIBILITY-FILTERED, WITHHELD OFFERS SHOWN WITH REASONS */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { OfferCard } from '../../components/OfferCard';
import { EventBanner } from '../../components/EventBanner';
import { Icon } from '../../components/Icon';
import { EmptyState, PageHead, Section } from '../../components/ui';
import { useAppState, useCurrentOrg } from '../../store/context';
import {
  claimsForRecipient,
  eligibleOffers,
  orgById,
  scheduledOffers,
  withheldOffers,
} from '../../store/selectors';
import { useT } from '../../i18n/useT';
import { formatKg } from '../../lib/format';
import './Recipient.css';

export function OfferFeed() {
  const state = useAppState();
  const org = useCurrentOrg()!;
  const t = useT();
  const [showWithheld, setShowWithheld] = useState(false);

  const offers = eligibleOffers(state, org);
  const upcoming = scheduledOffers(state, org);
  const withheld = withheldOffers(state, org);
  const active = claimsForRecipient(state, org.id).filter(
    (c) => !c.claim.releasedAt && c.stage !== 'complete',
  );

  return (
    <>
      <PageHead
        title={t('feed.title')}
        lead={`${org.name}, ${org.suburb}. Filtered to what you can store and carry.`}
      />

      <EventBanner />

      {active.length > 0 && (
        <Link to="/recipient/claims" className="feed__active">
          <Icon name="check-circle" size={20} />
          <span>
            <strong>
              {active.length} claim{active.length === 1 ? '' : 's'} in progress
            </strong>
            <span>Collection or confirmation still to come</span>
          </span>
          <Icon name="forward" size={18} />
        </Link>
      )}

      <Section title="Available now" count={offers.length}>
        {offers.length === 0 ? (
          <EmptyState
            icon="box"
            title={t('feed.empty')}
            body="You will get a notification the moment something suitable is posted."
          />
        ) : (
          <div className="offer-list offer-list--wide">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                donor={orgById(state, offer.donorOrganisationId)}
                to={`/recipient/offers/${offer.id}`}
                fits
                footer={
                  <div className="row row--between row--wrap">
                    <span className="muted">
                      <Icon name="pin" size={15} />{' '}
                      {orgById(state, offer.donorOrganisationId)?.suburb}
                      {!org.hasTransport && ' · you will need a driver'}
                    </span>
                    <Link
                      to={`/recipient/offers/${offer.id}/claim`}
                      className="btn btn--go"
                    >
                      {t('claim.action')}
                    </Link>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Section>

      {upcoming.length > 0 && (
        <Section
          title={t('feed.scheduledTitle')}
          count={upcoming.length}
          actions={
            <Link to="/recipient/scheduled" className="btn btn--ghost">
              See all
            </Link>
          }
        >
          <div className="offer-list offer-list--wide">
            {upcoming.slice(0, 2).map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                donor={orgById(state, offer.donorOrganisationId)}
                to={`/recipient/offers/${offer.id}`}
                scheduled
              />
            ))}
          </div>
        </Section>
      )}

      {withheld.length > 0 && (
        <section className="section">
          <button
            type="button"
            className="feed__withheld-toggle"
            aria-expanded={showWithheld}
            onClick={() => setShowWithheld((v) => !v)}
          >
            <Icon name={showWithheld ? 'back' : 'forward'} size={18} />
            {t('feed.withheld')} ({withheld.length})
          </button>

          {showWithheld && (
            <div className="feed__withheld">
              <p className="muted">{t('feed.withheldWhy')}</p>
              <ul>
                {withheld.map(({ offer, reasons }) => (
                  <li key={offer.id}>
                    <div className="feed__withheld-offer">
                      <strong>{offer.title}</strong>
                      <span className="muted">
                        {formatKg(offer.offeredQuantityKg)} ·{' '}
                        {orgById(state, offer.donorOrganisationId)?.name}
                      </span>
                    </div>
                    <ul className="feed__reasons">
                      {reasons.map((reason) => (
                        <li key={reason}>
                          <Icon name="alert" size={14} />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <p className="muted feed__withheld-fix">
                If this is wrong, update what you can store on{' '}
                <Link to="/recipient/profile">your profile</Link>.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
