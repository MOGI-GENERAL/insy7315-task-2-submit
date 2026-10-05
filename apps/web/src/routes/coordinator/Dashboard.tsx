import { Link } from 'react-router-dom';
import type { ClaimListItem, Collection, OfferListResponse } from '@fedsa/contract';
import { useSession } from '../../auth/context';
import { Empty, LoadState } from '../../components/feedback';
import { Icon } from '../../components/Icon';
import { OfferCard } from '../../components/OfferCard';
import { PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useData, useLoad } from '../../data';
import { useT } from '../../i18n/useT';
import { formatKg, formatWhen } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import './Coordinator.css';

const REFRESH_MS = 15_000;
const SOON_MS = 30 * 60_000;

interface Transport {
  claim: ClaimListItem;
  collection: Collection | null;
}

/** a full page means more exist, so the tile reads `50+` */
const countOf = (page: OfferListResponse) =>
  `${page.items.length}${page.nextCursor === null ? '' : '+'}`;

export function Dashboard() {
  const { claims, handovers, offers, organisations } = useData();
  const { user } = useSession();
  const t = useT();
  const now = useNow(REFRESH_MS);

  const board = useLoad(
    async () => {
      const [open, claimed, collected, active, disputes, pending] = await Promise.all([
        offers.list({ view: 'all', status: 'open' }),
        offers.list({ view: 'all', status: 'claimed' }),
        offers.list({ view: 'all', status: 'collected' }),
        claims.list({ status: 'active' }),
        handovers.list({ condition: 'problem', resolved: false }),
        organisations.list({ type: 'recipient', status: 'pending' }),
      ]);
      const transport: Transport[] = await Promise.all(
        active.items
          .filter((claim) => claim.transportNeeded)
          .map(async (claim) => ({
            claim,
            collection: (await offers.get(claim.offerId)).collection,
          })),
      );
      return { open, claimed, collected, active: active.items, transport, disputes, pending };
    },
    [claims, handovers, offers, organisations],
    { refreshMs: REFRESH_MS },
  );

  return (
    <>
      <PageHead title={t('dash.title')} lead={t('dash.lead').replace('{name}', user.fullName)} />

      <LoadState result={board}>
        {(data) => {
          const expiringSoon = data.open.items.filter((offer) => {
            const left = new Date(offer.collectionDeadline).getTime() - now;
            return left > 0 && left <= SOON_MS;
          });
          const needDriver = data.transport.filter((row) => !row.collection);
          const waiting = needDriver.length + data.disputes.items.length + data.pending.total;

          return (
            <>
              <StatRow>
                <StatTile
                  icon="list"
                  label={t('dash.open')}
                  value={countOf(data.open)}
                  note={t('dash.openNote')}
                />
                <StatTile
                  icon="clock"
                  label={t('dash.expiring')}
                  value={String(expiringSoon.length)}
                  note={t('dash.expiringNote')}
                  tone={expiringSoon.length > 0 ? 'warn' : 'neutral'}
                />
                <StatTile
                  icon="box"
                  label={t('dash.claimed')}
                  value={countOf(data.claimed)}
                  note={t('dash.claimedNote')}
                />
                <StatTile
                  icon="truck"
                  label={t('dash.needsTransport')}
                  value={String(needDriver.length)}
                  note={t('dash.needsTransportNote')}
                  tone={needDriver.length > 0 ? 'bad' : 'good'}
                />
                <StatTile
                  icon="check-circle"
                  label={t('dash.collected')}
                  value={countOf(data.collected)}
                  note={t('dash.collectedNote')}
                  tone="good"
                />
              </StatRow>

              {waiting > 0 && (
                <Section title={t('dash.waitingTitle')} lead={t('dash.waitingLead')}>
                  <div className="todo-grid">
                    {needDriver.length > 0 && (
                      <Link to="/coordinator/dispatch" className="todo" data-tone="bad">
                        <Icon name="truck" size={24} />
                        <span className="todo__count">{needDriver.length}</span>
                        <span className="todo__label">{t('dash.todoDriver')}</span>
                        <span className="todo__note">{t('dash.todoDriverNote')}</span>
                      </Link>
                    )}
                    {data.disputes.items.length > 0 && (
                      <Link to="/coordinator/disputes" className="todo" data-tone="warn">
                        <Icon name="alert" size={24} />
                        <span className="todo__count">{data.disputes.items.length}</span>
                        <span className="todo__label">{t('dash.todoDispute')}</span>
                        <span className="todo__note">{t('dash.todoDisputeNote')}</span>
                      </Link>
                    )}
                    {data.pending.total > 0 && (
                      <Link to="/coordinator/verify" className="todo" data-tone="info">
                        <Icon name="shield" size={24} />
                        <span className="todo__count">{data.pending.total}</span>
                        <span className="todo__label">{t('dash.todoVerify')}</span>
                        <span className="todo__note">{t('dash.todoVerifyNote')}</span>
                      </Link>
                    )}
                  </div>
                </Section>
              )}

              <Section title={t('dash.closingTitle')} count={expiringSoon.length}>
                {expiringSoon.length === 0 ? (
                  <Empty
                    icon="check-circle"
                    title={t('dash.closingEmptyTitle')}
                    body={t('dash.closingEmptyBody')}
                  />
                ) : (
                  <div className="offer-list offer-list--wide">
                    {expiringSoon.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        footer={<span className="muted">{t('dash.unclaimed')}</span>}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section title={t('dash.progressTitle')} count={data.claimed.items.length}>
                {data.claimed.items.length === 0 ? (
                  <Empty icon="box" title={t('dash.progressEmpty')} />
                ) : (
                  <ul className="claim-list" aria-label={t('dash.progressTitle')}>
                    {data.claimed.items.map((offer) => {
                      const claim = data.active.find((c) => c.offerId === offer.id);
                      const row = data.transport.find((r) => r.claim.id === claim?.id);
                      const driver = row?.collection ?? null;
                      return (
                        <li className="claim-row" key={offer.id}>
                          <div className="claim-row__top">
                            <span className="claim-row__label">
                              <strong>{offer.reference}</strong>
                              <span className="muted">{offer.title}</span>
                            </span>
                            <span className="claim-row__value">
                              <span className="num">{formatKg(offer.offeredQuantityKg)}</span>
                              <span className="muted">
                                {t('dash.by').replace(
                                  '{when}',
                                  formatWhen(offer.collectionDeadline),
                                )}
                              </span>
                            </span>
                          </div>
                          <div className="claim-row__meta">
                            <span className="muted">
                              {offer.donor.name}
                              {claim && ` → ${claim.recipient.name}`}
                            </span>
                            {!claim?.transportNeeded ? (
                              <span className="badge badge--quiet">{t('dash.ownVehicle')}</span>
                            ) : driver ? (
                              <span
                                className="badge"
                                data-tone={driver.status === 'cancelled' ? 'expired' : 'collected'}
                              >
                                {driver.status === 'cancelled'
                                  ? t('dash.driverCancelled')
                                  : driver.driverName}
                              </span>
                            ) : (
                              <span className="badge" data-tone="expiring">
                                {t('dash.needsDriver')}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </>
          );
        }}
      </LoadState>
    </>
  );
}
