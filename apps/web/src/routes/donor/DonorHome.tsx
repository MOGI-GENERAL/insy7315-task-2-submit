/* DONOR HOME — POST CTA FIRST, THEN STATUS OF EXISTING OFFERS */

import { Link } from 'react-router-dom';
import { OfferCard } from '../../components/OfferCard';
import { EventBanner } from '../../components/EventBanner';
import { Icon } from '../../components/Icon';
import { PageHead, Section, StatRow, StatTile, EmptyState } from '../../components/ui';
import { useAppState, useCurrentOrg, useCurrentUser } from '../../store/context';
import { claimsForDonor, offersForDonor, orgById } from '../../store/selectors';
import { formatKg, formatNumber, mealsFromKg } from '../../lib/format';
import { useT } from '../../i18n/useT';

export function DonorHome() {
  const state = useAppState();
  const user = useCurrentUser()!;
  const org = useCurrentOrg()!;
  const t = useT();

  const offers = offersForDonor(state, org.id);
  const live = offers.filter((o) => o.status === 'open' || o.status === 'claimed');
  const recent = offers.filter((o) => o.status === 'collected' || o.status === 'expired').slice(0, 4);

  const claims = claimsForDonor(state, org.id);
  const awaitingMe = claims.filter((c) => c.stage === 'awaiting-your-confirmation');

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthKg = claims
    .filter((c) => c.handover?.recipientConfirmedAt?.startsWith(thisMonth))
    .reduce((sum, c) => sum + (c.handover?.recipientQuantityKg ?? 0), 0);

  return (
    <>
      <PageHead
        title={`Good afternoon, ${user.name.split(' ')[0]}`}
        lead={`${org.name}, ${org.suburb}`}
      />

      <EventBanner />

      <Link to="/donor/post" className="btn btn--primary btn--lg btn--block post-cta">
        <Icon name="plus" size={22} />
        {t('post.title')}
      </Link>

      <StatRow>
        <StatTile
          icon="scale"
          label="This month"
          value={formatNumber(monthKg)}
          unit="kg"
          note={`${formatNumber(mealsFromKg(monthKg))} meals`}
          tone="good"
        />
        <StatTile icon="list" label="Live offers" value={String(live.length)} note="Open or claimed" />
        <StatTile
          icon="clock"
          label="Waiting on you"
          value={String(awaitingMe.length)}
          note="Handovers to confirm"
          tone={awaitingMe.length > 0 ? 'warn' : 'neutral'}
        />
      </StatRow>

      {awaitingMe.length > 0 && (
        <Section
          title="Confirm a handover"
          lead="The food has been claimed. Confirm what leaves your premises, and the record protects you if anything is questioned later."
        >
          <div className="offer-list">
            {awaitingMe.map(({ claim, offer, recipientOrg }) => (
              <OfferCard
                key={claim.id}
                offer={offer}
                donor={org}
                to={`/donor/offers/${offer.id}`}
                footer={
                  <div className="row row--between row--wrap">
                    <span className="muted">
                      <Icon name="check-circle" size={15} /> {recipientOrg?.name} is collecting
                    </span>
                    <Link to={`/donor/handover/${claim.id}`} className="btn btn--go">
                      {t('handover.confirm')}
                    </Link>
                  </div>
                }
              />
            ))}
          </div>
        </Section>
      )}

      <Section title="Your live offers" count={live.length}>
        {live.length === 0 ? (
          <EmptyState
            icon="box"
            title="Nothing posted right now"
            body="When you have surplus, post it here and every organisation that can take it is notified at once."
            action={
              <Link to="/donor/post" className="btn btn--primary">
                {t('post.title')}
              </Link>
            }
          />
        ) : (
          <div className="offer-list offer-list--wide">
            {live.map((offer) => {
              const claim = claims.find((c) => c.offer.id === offer.id && !c.claim.releasedAt);
              return (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  donor={org}
                  to={`/donor/offers/${offer.id}`}
                  footer={
                    claim ? (
                      <span className="muted">
                        <Icon name="check" size={15} />{' '}
                        {orgById(state, claim.claim.recipientOrganisationId)?.name} claimed it
                      </span>
                    ) : (
                      <span className="muted">
                        <Icon name="clock" size={15} /> Waiting for a claim
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
        <Section title="Recently finished">
          <div className="offer-list offer-list--wide">
            {recent.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                donor={org}
                to={`/donor/offers/${offer.id}`}
                footer={
                  <span className="muted">
                    {offer.status === 'collected'
                      ? `${formatKg(offer.offeredQuantityKg)} collected`
                      : 'Nobody was able to take it'}
                  </span>
                }
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
