import { createHash } from 'node:crypto';
import {
  DriverToken,
  type CollectionResponse,
  type DispatchRequest,
  type DriverCollectionResponse,
  type RotateDriverLinkRequest,
  type UpdateCollectionRequest,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import type { Logger } from 'pino';
import {
  runInTransaction,
  type ClaimRepository,
  type CollectionRepository,
  type OfferRepository,
  type OrganisationRepository,
} from '../db/index.js';
import { InvalidStateError, NotFoundError, ValidationError } from '../errors.js';
import type { AuditService } from './audit-service.js';
import type { NotificationService } from './notification-service.js';
import { isDuplicate } from './offer-service.js';
import type { SessionUser } from './user-service.js';
import { collectionView } from './views.js';

const AUDIT_TARGET = 'collections';

const NOT_DISPATCHABLE = 'Only an active claim that needs transport can be dispatched';

/** the driver link works until a day after the offer's collection deadline */
const LINK_GRACE_MS = 24 * 60 * 60 * 1000;

const TOKEN_REUSED = { driverToken: 'This link has already been used' };

const LINK_EXPIRED = 'This collection is past its deadline and can no longer get a link';

export function hashDriverToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function linkExpired(offer: { collectionDeadline: Date }) {
  return Date.now() > offer.collectionDeadline.getTime() + LINK_GRACE_MS;
}

type StoredOrganisation = NonNullable<Awaited<ReturnType<OrganisationRepository['findById']>>>;

/** `created` is false when the claim already had a collection, which answers 200, not 201 */
export interface DispatchResult {
  created: boolean;
  response: CollectionResponse;
}

export class CollectionService {
  private readonly collections: CollectionRepository;
  private readonly claims: ClaimRepository;
  private readonly offers: OfferRepository;
  private readonly organisations: OrganisationRepository;
  private readonly audit: AuditService;
  private readonly notifications: Pick<NotificationService, 'sendSms'>;
  private readonly logger: Logger;
  private readonly webOrigin: string | null;

  constructor(
    collections: CollectionRepository,
    claims: ClaimRepository,
    offers: OfferRepository,
    organisations: OrganisationRepository,
    audit: AuditService,
    notifications: Pick<NotificationService, 'sendSms'>,
    logger: Logger,
    webOrigin: string | null = null,
  ) {
    this.collections = collections;
    this.claims = claims;
    this.offers = offers;
    this.organisations = organisations;
    this.audit = audit;
    this.notifications = notifications;
    this.logger = logger;
    this.webOrigin = webOrigin;
  }

  /** a repeat dispatch gets the first collection back, and the driver is not texted again */
  async dispatch(
    user: SessionUser,
    claimId: string,
    input: DispatchRequest,
  ): Promise<DispatchResult> {
    const claim = await this.claims.findById(claimId);
    if (!claim) throw new NotFoundError();

    const existing = await this.collections.findByClaim(claim._id);
    if (existing) return { created: false, response: { collection: collectionView(existing) } };

    if (claim.status !== 'active' || !claim.transportNeeded) {
      throw new InvalidStateError(NOT_DISPATCHABLE);
    }
    const [offer, recipient] = await Promise.all([
      this.offers.findById(claim.offerId),
      this.organisations.findById(claim.recipientOrganisationId),
    ]);
    const donor = offer ? await this.organisations.findById(offer.donorOrganisationId) : null;
    if (!offer || !recipient || !donor) throw new NotFoundError();

    let collection;
    try {
      collection = await runInTransaction(async (session) => {
        const current = await this.claims.findById(claim._id, session);
        if (current?.status !== 'active') throw new InvalidStateError(NOT_DISPATCHABLE);
        const created = await this.collections.create(
          {
            claimId: claim._id,
            dispatchedByUserId: new Types.ObjectId(user.id),
            driverName: input.driverName,
            driverPhone: input.driverPhone,
            dispatchedAt: new Date(),
            scheduledFor: new Date(input.scheduledFor),
            driverTokenHash: input.driverToken ? hashDriverToken(input.driverToken) : null,
            status: 'dispatched',
          },
          session,
        );
        await this.audit.record(
          user.id,
          'dispatch_driver',
          { type: AUDIT_TARGET, id: created._id },
          { session },
        );
        return created;
      });
    } catch (err) {
      if (isDuplicate(err, 'driverTokenHash')) throw new ValidationError(TOKEN_REUSED);
      // the same dispatch arrived twice at once and the other request saved first
      if (isDuplicate(err, 'claimId')) {
        const won = await this.collections.findByClaim(claim._id);
        if (won) return { created: false, response: { collection: collectionView(won) } };
      }
      throw err;
    }

    this.inBackground('texting the driver', () =>
      this.notifications.sendSms(
        collection.driverPhone,
        'driver_dispatched',
        {
          reference: offer.reference,
          pickupAddress: addressOf(donor),
          contactName: donor.contactName,
          contactPhone: donor.contactPhone,
          deadline: offer.collectionDeadline.toISOString(),
          dropOffAddress: addressOf(recipient),
          ...(this.webOrigin && input.driverToken
            ? { link: `${this.webOrigin}/c/${input.driverToken}` }
            : {}),
        },
        offer.id,
      ),
    );
    return { created: true, response: { collection: collectionView(collection) } };
  }

  /** only a dispatched collection can be closed, and it stays closed */
  async update(
    user: SessionUser,
    id: string,
    input: UpdateCollectionRequest,
  ): Promise<CollectionResponse> {
    const collection = await runInTransaction(async (session) => {
      const updated = await this.collections.updateIfDispatched(id, input.status, session);
      if (!updated) {
        const current = await this.collections.findById(id, session);
        if (!current) throw new NotFoundError();
        throw new InvalidStateError('This collection is already closed');
      }
      await this.audit.record(
        user.id,
        'update_collection',
        { type: AUDIT_TARGET, id: updated._id },
        { note: input.status, session },
      );
      return updated;
    });
    return { collection: collectionView(collection) };
  }

  /** the old link stops working at once. a token already in use is refused */
  async rotateDriverLink(user: SessionUser, id: string, input: RotateDriverLinkRequest) {
    const collection = await this.collections.findById(id);
    if (!collection) throw new NotFoundError();
    const claim = await this.claims.findById(collection.claimId);
    const offer = claim ? await this.offers.findById(claim.offerId) : null;
    if (offer && linkExpired(offer)) throw new InvalidStateError(LINK_EXPIRED);
    try {
      await runInTransaction(async (session) => {
        const updated = await this.collections.replaceDriverTokenHash(
          id,
          hashDriverToken(input.driverToken),
          session,
        );
        if (!updated) {
          const current = await this.collections.findById(id, session);
          if (!current) throw new NotFoundError();
          throw new InvalidStateError('This collection is already closed');
        }
        await this.audit.record(
          user.id,
          'rotate_driver_link',
          { type: AUDIT_TARGET, id: updated._id },
          { session },
        );
      });
    } catch (err) {
      if (isDuplicate(err, 'driverTokenHash')) throw new ValidationError(TOKEN_REUSED);
      throw err;
    }
  }

  /** every dead link answers the same 404. a guess learns nothing */
  async driverView(token: string): Promise<DriverCollectionResponse> {
    if (!DriverToken.safeParse(token).success) throw new NotFoundError();
    const collection = await this.collections.findByDriverTokenHash(hashDriverToken(token));
    if (collection?.status !== 'dispatched') throw new NotFoundError();
    const claim = await this.claims.findById(collection.claimId);
    if (claim?.status !== 'active') throw new NotFoundError();
    const [offer, recipient] = await Promise.all([
      this.offers.findById(claim.offerId),
      this.organisations.findById(claim.recipientOrganisationId),
    ]);
    const donor = offer ? await this.organisations.findById(offer.donorOrganisationId) : null;
    if (!offer || !recipient || !donor) throw new NotFoundError();
    if (linkExpired(offer)) throw new NotFoundError();

    return {
      reference: offer.reference,
      title: offer.title,
      description: offer.description ?? null,
      category: offer.category,
      quantityKg: offer.offeredQuantityKg,
      coldChain: offer.coldChain,
      collectionDeadline: offer.collectionDeadline.toISOString(),
      scheduledFor: collection.scheduledFor?.toISOString() ?? null,
      driverName: collection.driverName,
      pickup: stopOf(donor),
      dropOff: stopOf(recipient),
    };
  }

  private inBackground(what: string, work: () => Promise<unknown>) {
    work().catch((err: unknown) => this.logger.error({ err }, `${what} failed`));
  }
}

function addressOf(organisation: StoredOrganisation) {
  return `${organisation.addressLine}, ${organisation.suburb}`;
}

function stopOf(organisation: StoredOrganisation) {
  return {
    organisationName: organisation.name,
    address: addressOf(organisation),
    contactName: organisation.contactName,
    contactPhone: organisation.contactPhone,
  };
}
