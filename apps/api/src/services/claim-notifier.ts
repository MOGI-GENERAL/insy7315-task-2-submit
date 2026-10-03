import type { Claim, Offer } from '@fedsa/contract';
import type { Logger } from 'pino';

/** what `ClaimService` needs from `NotificationService` */
export interface ClaimNotifier {
  /** the donor hears who claimed it, and the other notified recipients that it has gone */
  notifyClaimed(offer: Offer, claim: Claim): Promise<void>;
}

/** stands in until `NotificationService` exists. it logs and sends nothing */
export class LoggingClaimNotifier implements ClaimNotifier {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async notifyClaimed(offer: Offer, claim: Claim) {
    this.logger.info(
      { offerId: offer.id, reference: offer.reference, claimId: claim.id },
      'offer claimed. no notification channel is connected yet',
    );
  }
}
