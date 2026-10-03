import type { Offer } from '@fedsa/contract';
import type { Logger } from 'pino';

/** what `OfferService` needs from `NotificationService` */
export interface OfferNotifier {
  notifyEligible(offer: Offer, recipientOrganisationIds: string[]): Promise<void>;
}

/** stands in until `NotificationService` exists. it logs the fan-out and sends nothing */
export class LoggingNotifier implements OfferNotifier {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async notifyEligible(offer: Offer, recipientOrganisationIds: string[]) {
    this.logger.info(
      {
        offerId: offer.id,
        reference: offer.reference,
        recipients: recipientOrganisationIds.length,
      },
      'offer posted. no notification channel is connected yet',
    );
  }
}
