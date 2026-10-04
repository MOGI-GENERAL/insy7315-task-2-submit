import type { Claim, Offer } from '@fedsa/contract';

/** what `ClaimService` needs from `NotificationService` */
export interface ClaimNotifier {
  /** the donor hears who claimed it, and the other notified recipients that it has gone */
  notifyClaimed(offer: Offer, claim: Claim): Promise<void>;
  /** the donor hears who released it */
  notifyReleased(offer: Offer, claim: Claim): Promise<void>;
}
