import type { Logger } from 'pino';
import {
  runInTransaction,
  type ClaimRepository,
  type CollectionRepository,
  type HandoverRepository,
  type OfferRepository,
} from '../db/index.js';

export const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface ExpirySummary {
  openExpired: number;
  claimedExpired: number;
  claimsExpired: number;
  collectionsCancelled: number;
}

export class ExpiryService {
  private readonly offers: OfferRepository;
  private readonly claims: ClaimRepository;
  private readonly handovers: HandoverRepository;
  private readonly collections: CollectionRepository;

  constructor(
    offers: OfferRepository,
    claims: ClaimRepository,
    handovers: HandoverRepository,
    collections: CollectionRepository,
  ) {
    this.offers = offers;
    this.claims = claims;
    this.handovers = handovers;
    this.collections = collections;
  }

  /**
   * safe to run twice, since every update filters on the status it moves from.
   * a claimed offer with a handover is waiting on the recipient and stays claimed
   */
  expireOverdue(now = new Date()): Promise<ExpirySummary> {
    return runInTransaction(async (session) => {
      const open = await this.offers.expireOpen(now, session);

      const overdue = await this.offers.overdueClaimedIds(now, session);
      const handedOver = new Set(
        (await this.handovers.offerIdsWithHandover(overdue, session)).map(String),
      );
      const unhanded = overdue.filter((id) => !handedOver.has(id.toString()));
      if (unhanded.length === 0) {
        return {
          openExpired: open.modifiedCount,
          claimedExpired: 0,
          claimsExpired: 0,
          collectionsCancelled: 0,
        };
      }

      const claimed = await this.offers.expireClaimed(unhanded, now, session);
      const claimIds = await this.claims.activeIdsForOffers(unhanded, session);
      const claims = await this.claims.expireActive(claimIds, session);
      const collections = await this.collections.cancelDispatchedForClaims(claimIds, session);
      return {
        openExpired: open.modifiedCount,
        claimedExpired: claimed.modifiedCount,
        claimsExpired: claims.modifiedCount,
        collectionsCancelled: collections.modifiedCount,
      };
    });
  }
}

/**
 * runs once at start and then on a timer, because the API has no cron service
 * beside it. a run still going when the next falls due is skipped
 */
export function startExpirySweep(
  expiry: Pick<ExpiryService, 'expireOverdue'>,
  logger: Logger,
  intervalMs = SWEEP_INTERVAL_MS,
) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      logger.info(await expiry.expireOverdue(), 'expiry sweep');
    } catch (err) {
      logger.error({ err }, 'expiry sweep failed');
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return { run, stop: () => clearInterval(timer) };
}
