/* COORDINATOR OPS BOARD — TRIAGE ORDER, NOT REPORTING ORDER */

import { Link } from 'react-router-dom';
import { OfferCard } from '../../components/OfferCard';
import { EventBanner } from '../../components/EventBanner';
import { Icon } from '../../components/Icon';
import { EmptyState, PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useAppState, useCurrentUser } from '../../store/context';
import { dashboard, headline, orgById } from '../../store/selectors';
import { formatKg, formatNumber, formatPercent, formatWhen } from '../../lib/format';
import './Coordinator.css';

export function Dashboard() {
  const state = useAppState();
  const user = useCurrentUser()!;

  const board = dashboard(state);
  const stats = headline(state);

  return (
    <>
      <PageHead
        title={`Operations board`}
        lead={`${user.name} · everything moving on the platform right now`}
      />

      <EventBanner />

      <StatRow>
        <StatTile
          icon="list"
          label="Open offers"
          value={String(board.open.length)}
          note={`${board.expiringSoon.length} closing within 2 hours`}
          tone={board.expiringSoon.length > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          icon="truck"
          label="Claimed, not collected"
          value={String(board.claimed.length)}
          note="In progress"
        />
        <StatTile
          icon="alert"
          label="Needs a driver"
          value={String(board.needsDriver.length)}
          note="Waiting on dispatch"
          tone={board.needsDriver.length > 0 ? 'bad' : 'good'}
        />
        <StatTile
          icon="check-circle"
          label="Collected today"
          value={String(board.collectedToday.length)}
          note={`${formatPercent(stats.claimRate)} claimed all time`}
          tone="good"
        />
      </StatRow>

      {(board.needsDriver.length > 0 ||
        board.openDisputes.length > 0 ||
        board.pendingVerification.length > 0) && (
        <Section title="Waiting on you" lead="Nothing else on this screen needs a decision.">
          <div className="todo-grid">
            {board.needsDriver.length > 0 && (
              <Link to="/coordinator/dispatch" className="todo" data-tone="bad">
                <Icon name="truck" size={24} />
                <span className="todo__count">{board.needsDriver.length}</span>
                <span className="todo__label">
                  collection{board.needsDriver.length === 1 ? '' : 's'} need a driver
                </span>
                <span className="todo__note">
                  Recipients with no vehicle cannot collect until you send one
                </span>
              </Link>
            )}
            {board.openDisputes.length > 0 && (
              <Link to="/coordinator/disputes" className="todo" data-tone="warn">
                <Icon name="alert" size={24} />
                <span className="todo__count">{board.openDisputes.length}</span>
                <span className="todo__label">
                  dispute{board.openDisputes.length === 1 ? '' : 's'} to settle
                </span>
                <span className="todo__note">
                  Quantity disagreements and condition reports affect reporting
                </span>
              </Link>
            )}
            {board.pendingVerification.length > 0 && (
              <Link to="/coordinator/verify" className="todo" data-tone="info">
                <Icon name="shield" size={24} />
                <span className="todo__count">{board.pendingVerification.length}</span>
                <span className="todo__label">
                  organisation{board.pendingVerification.length === 1 ? '' : 's'} to verify
                </span>
                <span className="todo__note">
                  They cannot claim food until the site visit is done
                </span>
              </Link>
            )}
          </div>
        </Section>
      )}

      <Section
        title="Closing soon"
        count={board.expiringSoon.length}
        lead="Open offers inside their last two hours. These are the ones that become waste if nobody claims them."
      >
        {board.expiringSoon.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="Nothing about to expire"
            body="Every open offer still has time on it."
          />
        ) : (
          <div className="offer-list offer-list--wide">
            {board.expiringSoon.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                donor={orgById(state, offer.donorOrganisationId)}
                footer={<span className="muted">Unclaimed - no coordinator action yet</span>}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Claimed and in progress" count={board.claimed.length}>
        {board.claimed.length === 0 ? (
          <EmptyState icon="box" title="Nothing in progress" />
        ) : (
          <ul className="claim-list" aria-label="Offers claimed but not yet collected">
            {board.claimed.map((offer) => {
              const claim = state.claims.find((c) => c.offerId === offer.id && !c.releasedAt);
              const collection = state.collections.find((c) => c.claimId === claim?.id);
              return (
                <li className="claim-row" key={offer.id}>
                  <div className="claim-row__top">
                    <span className="claim-row__label">
                      <strong>{offer.reference}</strong>
                      <span className="muted">{offer.title}</span>
                    </span>
                    <span className="claim-row__value">
                      <span className="num">{formatKg(offer.offeredQuantityKg)}</span>
                      <span className="muted">by {formatWhen(offer.collectionDeadline)}</span>
                    </span>
                  </div>
                  <div className="claim-row__meta">
                    <span className="muted">
                      {orgById(state, offer.donorOrganisationId)?.name} →{' '}
                      {orgById(state, claim?.recipientOrganisationId)?.name}
                    </span>
                    {!claim?.transportNeeded ? (
                      <span className="badge badge--quiet">Own vehicle</span>
                    ) : collection ? (
                      <span className="badge" data-tone="collected">
                        {collection.driverName}
                      </span>
                    ) : (
                      <span className="badge" data-tone="expiring">
                        Needs a driver
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Today" lead="What the platform has recorded since midnight.">
        <StatRow>
          <StatTile
            icon="check-circle"
            label="Collected today"
            value={String(board.collectedToday.length)}
            note="Handovers confirmed by both parties"
            tone="good"
          />
          <StatTile
            icon="alert"
            label="Expired today"
            value={String(board.expiredToday.length)}
            note="Nobody was able to take them"
            tone={board.expiredToday.length > 0 ? 'bad' : 'neutral'}
          />
          <StatTile
            icon="clock"
            label="Median time to claim"
            value={stats.medianMinutesToClaim === null ? '-' : String(stats.medianMinutesToClaim)}
            unit="min"
            note="Target is under 20"
            tone={
              stats.medianMinutesToClaim !== null && stats.medianMinutesToClaim <= 20
                ? 'good'
                : 'warn'
            }
          />
          <StatTile
            icon="scale"
            label="Moved all time"
            value={formatNumber(stats.totalKg)}
            unit="kg"
            note={`${formatNumber(stats.totalMeals)} meals`}
          />
        </StatRow>
      </Section>
    </>
  );
}
