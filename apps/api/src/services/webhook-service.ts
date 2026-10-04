import type { DeliveryStatus, TwilioInboundBody, TwilioStatusBody } from '@fedsa/contract';
import type { Logger } from 'pino';
import type {
  NotificationRepository,
  OfferRepository,
  OrganisationRepository,
  UserRepository,
} from '../db/index.js';
import { ForbiddenError, NotFoundError, OfferUnavailableError } from '../errors.js';
import { UNKNOWN_SENDER_REPLY, renderReply } from '../notifications/templates.js';
import {
  deliveryStatusFor,
  phoneFromAddress,
  twimlReply,
} from '../notifications/twilio-channels.js';
import type { ClaimService } from './claim-service.js';
import { REFERENCE_ALPHABET, REFERENCE_LENGTH } from './offer-reference.js';
import type { SessionUser } from './user-service.js';

/** `YES K4F2` once spaces are gone and letters are upper case. `yes please` is no reference */
const CLAIM_REPLY = new RegExp(`^YES([${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}})$`);

/** a report may only move a row forward, because Twilio does not promise their order */
const EARLIER_STATUSES: Record<DeliveryStatus, DeliveryStatus[]> = {
  queued: [],
  sent: ['queued'],
  delivered: ['queued', 'sent'],
  failed: ['queued', 'sent'],
};

type StoredUser = Awaited<ReturnType<UserRepository['findActiveOrganisationUsersByPhone']>>[number];

/** the offer reference in a claim reply, or null when the text is anything else */
export function parseClaimReply(body: string): string | null {
  const match = CLAIM_REPLY.exec(body.replace(/\s+/g, '').toUpperCase());
  return match ? match[1]! : null;
}

export class WebhookService {
  private readonly users: UserRepository;
  private readonly organisations: OrganisationRepository;
  private readonly offers: OfferRepository;
  private readonly notifications: NotificationRepository;
  private readonly claims: ClaimService;
  private readonly logger: Logger;

  constructor(
    users: UserRepository,
    organisations: OrganisationRepository,
    offers: OfferRepository,
    notifications: NotificationRepository,
    claims: ClaimService,
    logger: Logger,
  ) {
    this.users = users;
    this.organisations = organisations;
    this.offers = offers;
    this.notifications = notifications;
    this.claims = claims;
    this.logger = logger;
  }

  /** every reply gets an answer in TwiML. only an unexpected failure becomes an error */
  async answerReply(input: TwilioInboundBody): Promise<string> {
    return twimlReply(await this.replyText(input));
  }

  async recordDeliveryReport(input: TwilioStatusBody) {
    const status = deliveryStatusFor(input.MessageStatus);
    await this.notifications.updateDeliveryStatus(
      input.MessageSid,
      status,
      EARLIER_STATUSES[status],
    );
  }

  private async replyText(input: TwilioInboundBody): Promise<string> {
    const sender = await this.findSender(phoneFromAddress(input.From));
    if (!sender) {
      this.logger.info({ messageSid: input.MessageSid }, 'a reply came from an unknown number');
      return UNKNOWN_SENDER_REPLY;
    }
    const language = sender.languagePreference;

    const reference = parseClaimReply(input.Body);
    if (!reference) return renderReply('not_understood', language, {});

    const offer = await this.offers.findByReference(reference);
    if (!offer) return renderReply('unavailable', language, { reference });

    const organisation = await this.organisations.findById(sender.organisationId!);
    const user: SessionUser = {
      id: sender._id.toString(),
      role: sender.role,
      organisationId: sender.organisationId!.toString(),
    };
    try {
      // a reply cannot ask for transport. the organisation's own record answers it
      const result = await this.claims.claim(user, offer._id.toString(), {
        transportNeeded: organisation?.hasTransport !== true,
      });
      const contact = result.response.donorContact;
      return renderReply('claimed', language, {
        reference,
        pickupAddress: `${contact.addressLine}, ${contact.suburb}`,
        contactName: contact.name,
        contactPhone: contact.phone,
        deadline: offer.collectionDeadline.toISOString(),
      });
    } catch (err) {
      if (
        err instanceof ForbiddenError ||
        err instanceof NotFoundError ||
        err instanceof OfferUnavailableError
      ) {
        return renderReply('unavailable', language, { reference });
      }
      throw err;
    }
  }

  /**
   * a phone shared within one organisation claims for it as its longest-standing
   * user. one shared across organisations matches nobody, since either could be meant
   */
  private async findSender(phone: string): Promise<StoredUser | null> {
    const users = await this.users.findActiveOrganisationUsersByPhone(phone);
    const organisations = new Set(users.map((u) => u.organisationId!.toString()));
    return organisations.size === 1 ? users[0]! : null;
  }
}
