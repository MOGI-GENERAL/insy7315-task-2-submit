import type {
  ClaimListResponse,
  ClaimRequest,
  ClaimResponse,
  ClaimWithOfferResponse,
  DonorContact,
  ListClaimsQuery,
  Offer,
  ReleaseClaimRequest,
} from '@fedsa/contract';
import { Types, type ClientSession } from 'mongoose';
import type { Logger } from 'pino';
import {
  runInTransaction,
  type ClaimRepository,
  type CollectionRepository,
  type HandoverRepository,
  type OfferRepository,
  type OrganisationRepository,
} from '../db/index.js';
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  OfferUnavailableError,
} from '../errors.js';
import type { ClaimNotifier } from './claim-notifier.js';
import type { OfferNotifier } from './offer-notifier.js';
import type { OfferService } from './offer-service.js';
import { canClaim } from './organisation-status.js';
import type { SessionUser } from './user-service.js';
import { claimView } from './views.js';

/** My claims shows a season of history at most */
const LIST_LIMIT = 200;

type StoredOffer = NonNullable<Awaited<ReturnType<OfferRepository['findById']>>>;
type StoredOrganisation = NonNullable<Awaited<ReturnType<OrganisationRepository['findById']>>>;
type StoredClaim = NonNullable<Awaited<ReturnType<ClaimRepository['findById']>>>;

/** `created` is false when the organisation already had the claim, which answers 200, not 201 */
export interface ClaimResult {
  created: boolean;
  response: ClaimResponse;
}

export class ClaimService {
  private readonly claims: ClaimRepository;
  private readonly offers: OfferRepository;
  private readonly organisations: OrganisationRepository;
  private readonly handovers: HandoverRepository;
  private readonly collections: CollectionRepository;
  private readonly offerService: OfferService;
  private readonly offerNotifier: OfferNotifier;
  private readonly claimNotifier: ClaimNotifier;
  private readonly logger: Logger;

  constructor(
    claims: ClaimRepository,
    offers: OfferRepository,
    organisations: OrganisationRepository,
    handovers: HandoverRepository,
    collections: CollectionRepository,
    offerService: OfferService,
    offerNotifier: OfferNotifier,
    claimNotifier: ClaimNotifier,
    logger: Logger,
  ) {
    this.claims = claims;
    this.offers = offers;
    this.organisations = organisations;
    this.handovers = handovers;
    this.collections = collections;
    this.offerService = offerService;
    this.offerNotifier = offerNotifier;
    this.claimNotifier = claimNotifier;
    this.logger = logger;
  }

  /**
   * the PWA and the WhatsApp webhook both claim through here. a retry by the
   * organisation that already has the claim gets that claim back
   */
  async claim(user: SessionUser, offerId: string, input: ClaimRequest): Promise<ClaimResult> {
    const recipient = await this.findOrganisation(user.organisationId);
    if (!canClaim(recipient)) {
      throw new ForbiddenError('Your organisation has to be verified before it can claim');
    }
    const offer = await this.offers.findById(offerId);
    if (!offer) throw new NotFoundError();

    const held = await this.claims.findActive(offer._id, recipient._id);
    if (held) return { created: false, response: await this.claimResponse(held, recipient, offer) };

    // an offer the organisation could never see looks missing, as it does on `GET /api/offers/:id`
    if (!(await this.offerService.isEligibleRecipient(offer, recipient))) {
      throw new NotFoundError();
    }

    const claimed = await runInTransaction(async (session) => {
      const locked = await this.lockOffer(offer._id, session);
      if (!locked) return null;
      const claim = await this.claims.create(
        {
          offerId: locked._id,
          recipientOrganisationId: recipient._id,
          claimedByUserId: new Types.ObjectId(user.id),
          claimedAt: new Date(),
          transportNeeded: input.transportNeeded,
          status: 'active',
        },
        session,
      );
      return { claim, offer: locked };
    });

    if (!claimed) {
      // two taps from the same organisation race each other, and the other one won
      const won = await this.claims.findActive(offer._id, recipient._id);
      if (won) return { created: false, response: await this.claimResponse(won, recipient, offer) };
      throw await this.unavailable(offer._id);
    }

    const response = await this.claimResponse(claimed.claim, recipient, claimed.offer);
    const [view] = await this.offerService.toViews([claimed.offer]);
    this.inBackground('notifying the claim', () =>
      this.claimNotifier.notifyClaimed(view!, response.claim),
    );
    return { created: true, response };
  }

  /**
   * a released offer reopens at once and goes back to the other eligible recipients.
   * the route's ownership guard has already checked the claim is the caller's
   */
  async release(claimId: string, input: ReleaseClaimRequest): Promise<ClaimWithOfferResponse> {
    const result = await runInTransaction(async (session) => {
      const current = await this.claims.findById(claimId, session);
      if (!current) throw new NotFoundError();
      // once a handover exists the food has left the donor. the offer cannot reopen
      if (await this.handovers.findByClaim(current._id, session)) {
        throw new InvalidStateError('This claim has a handover and can no longer be released');
      }

      const released = await this.claims.releaseIfActive(
        current._id,
        input.reason || null,
        new Date(),
        session,
      );
      if (!released) {
        if (current.status === 'released') return { claim: current, reopened: null };
        throw new InvalidStateError('Only an active claim can be released');
      }
      // a dispatched driver would otherwise still go to the donor
      await this.collections.cancelDispatchedForClaims([released._id], session);
      const reopened = await this.offers.reopenIfClaimed(released.offerId, new Date(), session);
      return { claim: released, reopened };
    });

    const offer = result.reopened ?? (await this.offers.findById(result.claim.offerId));
    if (!offer) throw new NotFoundError();
    const [recipient, [view]] = await Promise.all([
      this.findOrganisation(result.claim.recipientOrganisationId),
      this.offerService.toViews([offer]),
    ]);

    if (result.reopened) {
      const releasedBy = result.claim.recipientOrganisationId.toString();
      this.inBackground('notifying the reopened offer', async () => {
        const recipients = await this.offerService.eligibleRecipients(result.reopened!);
        const others = recipients
          .map((r) => r._id.toString())
          .filter((id) => id !== releasedBy);
        await this.offerNotifier.notifyEligible(view!, others);
      });
      this.inBackground('notifying the release', () =>
        this.claimNotifier.notifyReleased(view!, claimView(result.claim, recipient)),
      );
    }
    return { claim: claimView(result.claim, recipient), offer: view! };
  }

  /** a recipient sees its own organisation's claims. a coordinator sees everyone's */
  async listClaims(user: SessionUser, query: ListClaimsQuery): Promise<ClaimListResponse> {
    const filter: Record<string, unknown> = {};
    if (user.role === 'recipient') {
      filter.recipientOrganisationId = new Types.ObjectId(user.organisationId!);
    }
    if (query.status) filter.status = query.status;

    const claims = await this.claims.list(filter, LIST_LIMIT);
    const offerIds = [...new Set(claims.map((c) => c.offerId.toString()))];
    const recipientIds = [...new Set(claims.map((c) => c.recipientOrganisationId.toString()))];
    const [offers, recipients] = await Promise.all([
      this.offers.findByIds(offerIds.map((id) => new Types.ObjectId(id))),
      this.organisations.findByIds(recipientIds.map((id) => new Types.ObjectId(id))),
    ]);
    const offerViews = new Map<string, Offer>(
      (await this.offerService.toViews(offers)).map((view) => [view.id, view]),
    );
    const recipientsById = new Map(recipients.map((r) => [r._id.toString(), r]));

    return {
      items: claims.map((claim) => ({
        ...claimView(claim, recipientsById.get(claim.recipientOrganisationId.toString())!),
        offer: offerViews.get(claim.offerId.toString())!,
      })),
    };
  }

  /** for the ownership guard on release */
  async ownerOf(claimId: string) {
    const claim = await this.claims.findById(claimId);
    return claim ? claim.recipientOrganisationId : null;
  }

  private lockOffer(offerId: Types.ObjectId, session: ClientSession) {
    return this.offers.lockIfClaimable(offerId, new Date(), session);
  }

  /** a scheduled offer and a taken one get different messages */
  private async unavailable(offerId: Types.ObjectId) {
    const offer = await this.offers.findById(offerId);
    if (offer?.status === 'claimed') return new OfferUnavailableError();
    if (offer?.status === 'open' && offer.availableFrom > new Date()) {
      return new OfferUnavailableError('This offer cannot be claimed yet');
    }
    return new OfferUnavailableError('This offer is no longer available');
  }

  private async claimResponse(
    claim: StoredClaim,
    recipient: StoredOrganisation,
    offer: StoredOffer,
  ): Promise<ClaimResponse> {
    const donor = await this.findOrganisation(offer.donorOrganisationId);
    return { claim: claimView(claim, recipient), donorContact: donorContact(donor) };
  }

  private inBackground(what: string, work: () => Promise<void>) {
    work().catch((err: unknown) => this.logger.error({ err }, `${what} failed`));
  }

  private async findOrganisation(id: Types.ObjectId | string | null) {
    const organisation = id ? await this.organisations.findById(id) : null;
    if (!organisation) throw new NotFoundError();
    return organisation;
  }
}

function donorContact(donor: StoredOrganisation): DonorContact {
  return {
    name: donor.contactName,
    phone: donor.contactPhone,
    addressLine: donor.addressLine,
    suburb: donor.suburb,
  };
}
