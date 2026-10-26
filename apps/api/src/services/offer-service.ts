import {
  MAX_PHOTOS_PER_OFFER,
  type CancelOfferRequest,
  type ListOffersQuery,
  type Offer,
  type OfferDetailResponse,
  type OfferListResponse,
  type OfferResponse,
  type PostOfferFields,
  type PostOfferResponse,
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
import { NotFoundError } from '../errors.js';
import { checkPhotos, type UploadedPhoto } from '../photos/check-photos.js';
import type { PhotoStore } from '../photos/photo-store.js';
import type { AuditService } from './audit-service.js';
import { dayRange } from './day-range.js';
import { eligibleRecipientsFilter, isEligible } from './eligibility.js';
import { claimOf, parseCursor, viewFilter } from './offer-access.js';
import { cancelOpenOffer } from './offer-cancel.js';
import type { OfferNotifier } from './offer-notifier.js';
import { clientRequestId, createWithReference, isDuplicate } from './offer-posting.js';
import { newOfferReference } from './offer-reference.js';
import {
  donorsOf,
  findOrganisation,
  toOfferView,
  type StoredOffer,
  type StoredOrganisation,
} from './offer-records.js';
import type { SessionUser } from './user-service.js';
import { claimView, collectionView, handoverView } from './views.js';

const PAGE_SIZE = 50;

export interface OfferSettings {
  radiusKm: number;
  logger: Logger;
  /** tests replace it to force a clash */
  newReference?: () => string;
}

export { isDuplicate };

export class OfferService {
  private readonly offers: OfferRepository;
  private readonly organisations: OrganisationRepository;
  private readonly claims: ClaimRepository;
  private readonly collections: CollectionRepository;
  private readonly handovers: HandoverRepository;
  private readonly audit: AuditService;
  private readonly photos: PhotoStore;
  private readonly notifier: OfferNotifier;
  private readonly radiusKm: number;
  private readonly logger: Logger;
  private readonly newReference: () => string;

  constructor(
    offers: OfferRepository,
    organisations: OrganisationRepository,
    claims: ClaimRepository,
    collections: CollectionRepository,
    handovers: HandoverRepository,
    audit: AuditService,
    photos: PhotoStore,
    notifier: OfferNotifier,
    settings: OfferSettings,
  ) {
    this.offers = offers;
    this.organisations = organisations;
    this.claims = claims;
    this.collections = collections;
    this.handovers = handovers;
    this.audit = audit;
    this.photos = photos;
    this.notifier = notifier;
    this.radiusKm = settings.radiusKm;
    this.logger = settings.logger;
    this.newReference = settings.newReference ?? newOfferReference;
  }

  /** the fan-out starts after the offer is saved and is not awaited, so it never slows the reply */
  async postOffer(
    user: SessionUser,
    input: PostOfferFields,
    files: UploadedPhoto[],
    idempotencyKey: string | undefined,
  ): Promise<PostOfferResponse> {
    const donor = await findOrganisation(this.organisations, user.organisationId);
    const requestId = clientRequestId(donor._id, idempotencyKey);
    if (requestId) {
      const existing = await this.offers.findByClientRequestId(requestId);
      if (existing) return this.repeatedPost(existing, donor);
    }

    const checked = await checkPhotos(files, MAX_PHOTOS_PER_OFFER);
    const stored = await Promise.all(
      checked.map((photo) => this.photos.put(photo.buffer, photo.mime)),
    );

    let offer: StoredOffer;
    try {
      offer = await createWithReference(this.offers, this.newReference, {
        donorOrganisationId: donor._id,
        postedByUserId: new Types.ObjectId(user.id),
        title: input.title,
        description: input.description || null,
        category: input.category,
        offeredQuantityKg: input.offeredQuantityKg,
        coldChain: input.coldChain,
        photoUrls: stored.map((photo) => photo.url),
        availableFrom: input.availableFrom ? new Date(input.availableFrom) : new Date(),
        collectionDeadline: new Date(input.collectionDeadline),
        status: 'open',
        ...(requestId ? { clientRequestId: requestId } : {}),
      });
    } catch (err) {
      // the same key arrived twice at once and the other request saved first
      if (requestId && isDuplicate(err, 'clientRequestId')) {
        const existing = await this.offers.findByClientRequestId(requestId);
        if (existing) return this.repeatedPost(existing, donor);
      }
      throw err;
    }

    const view = toOfferView(this.photos, offer, donor, false);
    const recipients = await this.eligibleRecipients(offer, donor);
    this.notifyInBackground(
      view,
      recipients.map((recipient) => recipient._id.toString()),
    );
    return { offer: view, notifiedCount: recipients.length };
  }

  /**
   * offers what was left behind, open until the parent's deadline. null once that
   * deadline has passed
   */
  async splitRemainder(
    parent: StoredOffer,
    user: SessionUser,
    remainderKg: number,
  ): Promise<Offer | null> {
    const now = new Date();
    if (parent.collectionDeadline <= now) return null;

    const donor = await findOrganisation(this.organisations, parent.donorOrganisationId);
    const child = await createWithReference(this.offers, this.newReference, {
      donorOrganisationId: parent.donorOrganisationId,
      postedByUserId: new Types.ObjectId(user.id),
      title: parent.title,
      description: parent.description ?? null,
      category: parent.category,
      offeredQuantityKg: remainderKg,
      coldChain: parent.coldChain,
      photoUrls: parent.photoUrls,
      availableFrom: now,
      collectionDeadline: parent.collectionDeadline,
      status: 'open',
      parentOfferId: parent._id,
    });

    const view = toOfferView(this.photos, child, donor, false);
    const recipients = await this.eligibleRecipients(child, donor);
    this.notifyInBackground(
      view,
      recipients.map((recipient) => recipient._id.toString()),
    );
    return view;
  }

  /** recipient organisations the offer goes to, in name order */
  async eligibleRecipients(offer: StoredOffer, donor?: StoredOrganisation) {
    const owner = donor ?? (await findOrganisation(this.organisations, offer.donorOrganisationId));
    return this.organisations.findMatching(
      eligibleRecipientsFilter(offer, owner.location.coordinates, this.radiusKm),
    );
  }

  async isEligibleRecipient(offer: StoredOffer, recipient: StoredOrganisation) {
    const donor = await findOrganisation(this.organisations, offer.donorOrganisationId);
    return isEligible(recipient, offer, donor.location.coordinates, this.radiusKm);
  }

  async listOffers(user: SessionUser, query: ListOffersQuery): Promise<OfferListResponse> {
    const before = query.cursor === undefined ? undefined : parseCursor(query.cursor);
    const filter = await viewFilter(this.organisations, this.radiusKm, user, query.view);
    if (!filter) return { items: [], nextCursor: null };

    const conditions: Record<string, unknown>[] = [filter];
    if (query.status) conditions.push({ status: query.status });
    if (query.from || query.to) conditions.push({ availableFrom: dayRange(query.from, query.to) });

    const page = await this.offers.list({ $and: conditions }, PAGE_SIZE + 1, before);
    const items = page.slice(0, PAGE_SIZE);
    const donors = await donorsOf(this.organisations, items);
    return {
      items: items.map((offer) =>
        toOfferView(this.photos, offer, donors.get(offer.donorOrganisationId.toString())!, false),
      ),
      nextCursor: page.length > PAGE_SIZE ? items[items.length - 1]!._id.toString() : null,
    };
  }

  /** another organisation's offer, or one a recipient is not eligible for, looks missing */
  async getOffer(user: SessionUser, id: string): Promise<OfferDetailResponse> {
    const offer = await this.offers.findById(id);
    if (!offer) throw new NotFoundError();
    const donor = await findOrganisation(this.organisations, offer.donorOrganisationId);
    const claim = await claimOf(this.claims, this.organisations, this.radiusKm, user, offer, donor);

    const [claimant, collection, handover] = claim
      ? await Promise.all([
          this.organisations.findById(claim.recipientOrganisationId),
          this.collections.findByClaim(claim._id),
          this.handovers.findByClaim(claim._id),
        ])
      : [null, null, null];

    return {
      offer: toOfferView(this.photos, offer, donor, true),
      claim: claim && claimant ? claimView(claim, claimant) : null,
      collection: collection ? collectionView(collection) : null,
      handover: handover
        ? handoverView(
            handover,
            handover.donorPhotoUrl ? this.photos.thumbnailUrl(handover.donorPhotoUrl) : null,
          )
        : null,
    };
  }

  /** list views, as `listOffers` builds them, for services that embed offers */
  async toViews(offers: StoredOffer[]): Promise<Offer[]> {
    const donors = await donorsOf(this.organisations, offers);
    return offers.map((offer) =>
      toOfferView(this.photos, offer, donors.get(offer.donorOrganisationId.toString())!, false),
    );
  }

  /** for the ownership guard. coordinators skip it */
  async ownerOf(id: string) {
    const offer = await this.offers.findById(id);
    return offer ? offer.donorOrganisationId : null;
  }

  /**
   * only an open offer can be cancelled, by its donor or by a coordinator. a
   * claimed offer has to be released first, so no active claim is left behind
   */
  async cancelOffer(
    user: SessionUser,
    id: string,
    input: CancelOfferRequest,
  ): Promise<OfferResponse> {
    const cancel = (session?: ClientSession) =>
      cancelOpenOffer(this.offers, this.audit, user, id, input, session);

    const offer =
      user.role === 'coordinator'
        ? await runInTransaction((session) => cancel(session))
        : await cancel();
    const donor = await findOrganisation(this.organisations, offer.donorOrganisationId);
    return { offer: toOfferView(this.photos, offer, donor, false) };
  }

  /** a repeat sends nothing, and reports how many organisations the offer reaches now */
  private async repeatedPost(
    offer: StoredOffer,
    donor: StoredOrganisation,
  ): Promise<PostOfferResponse> {
    const recipients = await this.eligibleRecipients(offer, donor);
    return {
      offer: toOfferView(this.photos, offer, donor, false),
      notifiedCount: recipients.length,
    };
  }

  private notifyInBackground(offer: Offer, recipientOrganisationIds: string[]) {
    this.notifier.notifyEligible(offer, recipientOrganisationIds).catch((err: unknown) => {
      this.logger.error({ err, offerId: offer.id }, 'notifying eligible recipients failed');
    });
  }
}
