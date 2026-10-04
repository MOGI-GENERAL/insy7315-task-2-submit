import {
  IDEMPOTENCY_HEADER,
  MAX_PHOTOS_PER_OFFER,
  objectId,
  type CancelOfferRequest,
  type ListOffersQuery,
  type Offer,
  type OfferDetailResponse,
  type OfferListResponse,
  type OfferResponse,
  type OfferView,
  type Photo,
  type PostOfferFields,
  type PostOfferResponse,
  type Role,
} from '@fedsa/contract';
import { Types, mongo, type ClientSession } from 'mongoose';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  runInTransaction,
  type ClaimRepository,
  type CollectionRepository,
  type HandoverRepository,
  type OfferDoc,
  type OfferRepository,
  type OrganisationRepository,
} from '../db/index.js';
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from '../errors.js';
import { checkPhotos, type UploadedPhoto } from '../photos/check-photos.js';
import type { PhotoStore } from '../photos/photo-store.js';
import type { AuditService } from './audit-service.js';
import { dayRange } from './day-range.js';
import {
  eligibleRecipientsFilter,
  isEligible,
  nearbyDonorsFilter,
  offersForRecipientFilter,
} from './eligibility.js';
import type { OfferNotifier } from './offer-notifier.js';
import { newOfferReference } from './offer-reference.js';
import { canClaim } from './organisation-status.js';
import type { SessionUser } from './user-service.js';
import { claimView, collectionView, handoverView, offerView } from './views.js';

const PAGE_SIZE = 50;

/** about 900,000 references exist, so a clash is rare and a few retries are plenty */
const MAX_REFERENCE_ATTEMPTS = 5;

const DUPLICATE_KEY = 11000;

const AUDIT_TARGET = 'offers';

const VIEW_ROLES: Record<OfferView, Role[]> = {
  feed: ['recipient'],
  scheduled: ['recipient'],
  mine: ['donor'],
  all: ['coordinator'],
};

/** a client UUID in practice */
const IdempotencyKey = z.string().trim().min(1).max(64);

type StoredOffer = NonNullable<Awaited<ReturnType<OfferRepository['findById']>>>;
type StoredOrganisation = NonNullable<Awaited<ReturnType<OrganisationRepository['findById']>>>;
type StoredClaim = NonNullable<Awaited<ReturnType<ClaimRepository['findById']>>>;

export interface OfferSettings {
  radiusKm: number;
  logger: Logger;
  /** tests replace it to force a clash */
  newReference?: () => string;
}

function isDuplicate(err: unknown, field: string) {
  return (
    err instanceof mongo.MongoServerError &&
    err.code === DUPLICATE_KEY &&
    field in (err.keyPattern ?? {})
  );
}

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
    const donor = await this.findOrganisation(user.organisationId);
    const clientRequestId = this.clientRequestId(donor._id, idempotencyKey);
    if (clientRequestId) {
      const existing = await this.offers.findByClientRequestId(clientRequestId);
      if (existing) return this.repeatedPost(existing, donor);
    }

    const checked = await checkPhotos(files, MAX_PHOTOS_PER_OFFER);
    const stored = await Promise.all(
      checked.map((photo) => this.photos.put(photo.buffer, photo.mime)),
    );

    let offer: StoredOffer;
    try {
      offer = await this.createWithReference({
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
        ...(clientRequestId ? { clientRequestId } : {}),
      });
    } catch (err) {
      // the same key arrived twice at once and the other request saved first
      if (clientRequestId && isDuplicate(err, 'clientRequestId')) {
        const existing = await this.offers.findByClientRequestId(clientRequestId);
        if (existing) return this.repeatedPost(existing, donor);
      }
      throw err;
    }

    const view = this.view(offer, donor, false);
    const recipients = await this.eligibleRecipients(offer, donor);
    this.notifyInBackground(
      view,
      recipients.map((recipient) => recipient._id.toString()),
    );
    return { offer: view, notifiedCount: recipients.length };
  }

  /** recipient organisations the offer goes to, in name order */
  async eligibleRecipients(offer: StoredOffer, donor?: StoredOrganisation) {
    const owner = donor ?? (await this.findOrganisation(offer.donorOrganisationId));
    return this.organisations.findMatching(
      eligibleRecipientsFilter(offer, owner.location.coordinates, this.radiusKm),
    );
  }

  async isEligibleRecipient(offer: StoredOffer, recipient: StoredOrganisation) {
    const donor = await this.findOrganisation(offer.donorOrganisationId);
    return isEligible(recipient, offer, donor.location.coordinates, this.radiusKm);
  }

  async listOffers(user: SessionUser, query: ListOffersQuery): Promise<OfferListResponse> {
    const before = query.cursor === undefined ? undefined : this.parseCursor(query.cursor);
    const viewFilter = await this.viewFilter(user, query.view);
    if (!viewFilter) return { items: [], nextCursor: null };

    const conditions: Record<string, unknown>[] = [viewFilter];
    if (query.status) conditions.push({ status: query.status });
    if (query.from || query.to) conditions.push({ availableFrom: dayRange(query.from, query.to) });

    const page = await this.offers.list({ $and: conditions }, PAGE_SIZE + 1, before);
    const items = page.slice(0, PAGE_SIZE);
    const donors = await this.donorsOf(items);
    return {
      items: items.map((offer) =>
        this.view(offer, donors.get(offer.donorOrganisationId.toString())!, false),
      ),
      nextCursor: page.length > PAGE_SIZE ? items[items.length - 1]!._id.toString() : null,
    };
  }

  /** another organisation's offer, or one a recipient is not eligible for, looks missing */
  async getOffer(user: SessionUser, id: string): Promise<OfferDetailResponse> {
    const offer = await this.offers.findById(id);
    if (!offer) throw new NotFoundError();
    const donor = await this.findOrganisation(offer.donorOrganisationId);
    const claim = await this.claimFor(user, offer, donor);

    const [claimant, collection, handover] = claim
      ? await Promise.all([
          this.organisations.findById(claim.recipientOrganisationId),
          this.collections.findByClaim(claim._id),
          this.handovers.findByClaim(claim._id),
        ])
      : [null, null, null];

    return {
      offer: this.view(offer, donor, true),
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
    const donors = await this.donorsOf(offers);
    return offers.map((offer) =>
      this.view(offer, donors.get(offer.donorOrganisationId.toString())!, false),
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
    const cancel = async (session?: ClientSession) => {
      const cancelled = await this.offers.cancelIfOpen(id, session);
      if (cancelled) {
        if (user.role === 'coordinator') {
          await this.audit.record(
            user.id,
            'cancel_offer',
            { type: AUDIT_TARGET, id: cancelled._id },
            { note: input.reason || null, session },
          );
        }
        return cancelled;
      }

      const current = await this.offers.findById(id, session);
      if (!current) throw new NotFoundError();
      // a repeated cancel gets the same answer as the first and is not audited twice
      if (current.status === 'cancelled') return current;
      throw new InvalidStateError('Only an open offer can be cancelled');
    };

    const offer =
      user.role === 'coordinator'
        ? await runInTransaction((session) => cancel(session))
        : await cancel();
    const donor = await this.findOrganisation(offer.donorOrganisationId);
    return { offer: this.view(offer, donor, false) };
  }

  /** a repeat sends nothing, and reports how many organisations the offer reaches now */
  private async repeatedPost(
    offer: StoredOffer,
    donor: StoredOrganisation,
  ): Promise<PostOfferResponse> {
    const recipients = await this.eligibleRecipients(offer, donor);
    return { offer: this.view(offer, donor, false), notifiedCount: recipients.length };
  }

  /** scoped to the donor, so one organisation's key can never return another's offer */
  private clientRequestId(donorId: Types.ObjectId, key: string | undefined) {
    if (key === undefined) return undefined;
    const parsed = IdempotencyKey.safeParse(key);
    if (!parsed.success) {
      throw new ValidationError({ [IDEMPOTENCY_HEADER]: 'Must be 1 to 64 characters' });
    }
    return `${donorId.toString()}:${parsed.data}`;
  }

  private async createWithReference(data: Partial<OfferDoc>) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.offers.create({ ...data, reference: this.newReference() });
      } catch (err) {
        if (attempt >= MAX_REFERENCE_ATTEMPTS || !isDuplicate(err, 'reference')) throw err;
      }
    }
  }

  private notifyInBackground(offer: Offer, recipientOrganisationIds: string[]) {
    this.notifier.notifyEligible(offer, recipientOrganisationIds).catch((err: unknown) => {
      this.logger.error({ err, offerId: offer.id }, 'notifying eligible recipients failed');
    });
  }

  /** null when the caller has nothing to see in the view */
  private async viewFilter(
    user: SessionUser,
    view: OfferView,
  ): Promise<Record<string, unknown> | null> {
    if (!VIEW_ROLES[view].includes(user.role)) {
      throw new ForbiddenError(`The ${view} view is not available to your role`);
    }
    if (view === 'all') return {};
    if (view === 'mine') return { donorOrganisationId: new Types.ObjectId(user.organisationId!) };

    // pending, rejected and suspended recipients have not been vetted, so they see no offers
    const recipient = await this.findOrganisation(user.organisationId);
    if (!canClaim(recipient)) return null;

    const donorIds = await this.organisations.idsMatching(
      nearbyDonorsFilter(recipient.location.coordinates, this.radiusKm),
    );
    const now = new Date();
    const timing =
      view === 'feed'
        ? { availableFrom: { $lte: now }, collectionDeadline: { $gt: now } }
        : { availableFrom: { $gt: now } };
    return {
      status: 'open',
      donorOrganisationId: { $in: donorIds },
      ...offersForRecipientFilter(recipient),
      ...timing,
    };
  }

  /** throws not found when the caller may not see the offer at all */
  private async claimFor(
    user: SessionUser,
    offer: StoredOffer,
    donor: StoredOrganisation,
  ): Promise<StoredClaim | null> {
    if (user.role === 'coordinator') return this.claims.latestForOffer(offer._id);
    if (user.role === 'donor') {
      if (offer.donorOrganisationId.toString() !== user.organisationId) throw new NotFoundError();
      return this.claims.latestForOffer(offer._id);
    }

    const recipient = await this.findOrganisation(user.organisationId);
    const own = await this.claims.latestForOffer(offer._id, recipient._id);
    if (own) return own;
    if (!isEligible(recipient, offer, donor.location.coordinates, this.radiusKm)) {
      throw new NotFoundError();
    }
    return null;
  }

  private parseCursor(cursor: string) {
    if (!objectId.safeParse(cursor).success) {
      throw new ValidationError({ cursor: 'Not a cursor from a previous page' });
    }
    return new Types.ObjectId(cursor);
  }

  private async donorsOf(offers: StoredOffer[]) {
    const ids = [...new Set(offers.map((offer) => offer.donorOrganisationId.toString()))];
    const donors = await this.organisations.findByIds(ids.map((id) => new Types.ObjectId(id)));
    return new Map(donors.map((donor) => [donor._id.toString(), donor]));
  }

  private view(offer: StoredOffer, donor: StoredOrganisation, withFullSize: boolean): Offer {
    const photos: Photo[] = offer.photoUrls.map((url) =>
      withFullSize
        ? { thumbUrl: this.photos.thumbnailUrl(url), url: this.photos.fullSizeUrl(url) }
        : { thumbUrl: this.photos.thumbnailUrl(url) },
    );
    return offerView(offer, donor, photos);
  }

  private async findOrganisation(id: Types.ObjectId | string | null) {
    const organisation = id ? await this.organisations.findById(id) : null;
    if (!organisation) throw new NotFoundError();
    return organisation;
  }
}
