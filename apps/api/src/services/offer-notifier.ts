import type { Offer } from '@fedsa/contract';

/** what `OfferService` needs from `NotificationService` */
export interface OfferNotifier {
  notifyEligible(offer: Offer, recipientOrganisationIds: string[]): Promise<void>;
}
