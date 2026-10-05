import type { CollectionResponse, DispatchRequest, UpdateCollectionRequest } from '@fedsa/contract';
import { Types } from 'mongoose';
import type { Logger } from 'pino';
import {
  runInTransaction,
  type ClaimRepository,
  type CollectionRepository,
  type OfferRepository,
  type OrganisationRepository,
} from '../db/index.js';
import { InvalidStateError, NotFoundError } from '../errors.js';
import type { AuditService } from './audit-service.js';
import type { NotificationService } from './notification-service.js';
import { isDuplicate } from './offer-service.js';
import type { SessionUser } from './user-service.js';
import { collectionView } from './views.js';

const AUDIT_TARGET = 'collections';

const NOT_DISPATCHABLE = 'Only an active claim that needs transport can be dispatched';

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

  constructor(
    collections: CollectionRepository,
    claims: ClaimRepository,
    offers: OfferRepository,
    organisations: OrganisationRepository,
    audit: AuditService,
    notifications: Pick<NotificationService, 'sendSms'>,
    logger: Logger,
  ) {
    this.collections = collections;
    this.claims = claims;
    this.offers = offers;
    this.organisations = organisations;
    this.audit = audit;
    this.notifications = notifications;
    this.logger = logger;
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

  private inBackground(what: string, work: () => Promise<unknown>) {
    work().catch((err: unknown) => this.logger.error({ err }, `${what} failed`));
  }
}

function addressOf(organisation: StoredOrganisation) {
  return `${organisation.addressLine}, ${organisation.suburb}`;
}
