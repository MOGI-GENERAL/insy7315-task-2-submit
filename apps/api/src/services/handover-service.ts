import type {
  DonorConfirmFields,
  DonorConfirmResponse,
  HandoverListResponse,
  HandoverResponse,
  ListHandoversQuery,
  Offer,
  RecipientConfirmRequest,
  RecipientConfirmResponse,
  ResolutionRequest,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import type { Logger } from 'pino';
import {
  runInTransaction,
  type ClaimRepository,
  type HandoverRepository,
  type OfferRepository,
  type OrganisationRepository,
} from '../db/index.js';
import { InvalidStateError, NotFoundError, ValidationError } from '../errors.js';
import { checkPhotos, type UploadedPhoto } from '../photos/check-photos.js';
import type { PhotoStore } from '../photos/photo-store.js';
import type { AuditService } from './audit-service.js';
import type { NotificationService } from './notification-service.js';
import { isDuplicate, type OfferService } from './offer-service.js';
import { nextStatus } from './organisation-status.js';
import type { SessionUser } from './user-service.js';
import { handoverView, organisationSummary } from './views.js';

/** photos are kept for the same 24 months as the record */
const RETENTION_MONTHS = 24;

/** the disputes screen shows recent history only */
const LIST_LIMIT = 200;

const AUDIT_TARGET = 'handoverRecords';

type StoredOffer = NonNullable<Awaited<ReturnType<OfferRepository['findById']>>>;
type StoredHandover = NonNullable<Awaited<ReturnType<HandoverRepository['findById']>>>;
type StoredClaim = NonNullable<Awaited<ReturnType<ClaimRepository['findById']>>>;

/** `created` is false when the claim already had a handover, which answers 200, not 201 */
export interface DonorConfirmResult {
  created: boolean;
  response: DonorConfirmResponse;
}

export class HandoverService {
  private readonly handovers: HandoverRepository;
  private readonly claims: ClaimRepository;
  private readonly offers: OfferRepository;
  private readonly organisations: OrganisationRepository;
  private readonly offerService: OfferService;
  private readonly audit: AuditService;
  private readonly photos: PhotoStore;
  private readonly notifications: Pick<NotificationService, 'notifyOrganisations'>;
  private readonly logger: Logger;

  constructor(
    handovers: HandoverRepository,
    claims: ClaimRepository,
    offers: OfferRepository,
    organisations: OrganisationRepository,
    offerService: OfferService,
    audit: AuditService,
    photos: PhotoStore,
    notifications: Pick<NotificationService, 'notifyOrganisations'>,
    logger: Logger,
  ) {
    this.handovers = handovers;
    this.claims = claims;
    this.offers = offers;
    this.organisations = organisations;
    this.offerService = offerService;
    this.audit = audit;
    this.photos = photos;
    this.notifications = notifications;
    this.logger = logger;
  }

  /**
   * the route's ownership guard has checked the offer is the donor's. a retry gets
   * the existing record back and no second one is made
   */
  async donorConfirm(
    user: SessionUser,
    offerId: string,
    input: DonorConfirmFields,
    files: UploadedPhoto[],
  ): Promise<DonorConfirmResult> {
    const offer = await this.offers.findById(offerId);
    if (!offer) throw new NotFoundError();
    const claim = await this.claims.latestForOffer(offer._id);
    if (!claim) throw new InvalidStateError('This offer has not been claimed');

    const existing = await this.handovers.findByClaim(claim._id);
    if (existing)
      return { created: false, response: await this.donorResponse(user, offer, existing) };

    if (offer.status !== 'claimed' || claim.status !== 'active') {
      throw new InvalidStateError('Only a claimed offer can be handed over');
    }
    if (input.collectedQuantityKg > offer.offeredQuantityKg) {
      throw new ValidationError({ collectedQuantityKg: 'More than was offered' });
    }

    const [checked] = await checkPhotos(files, 1);
    const stored = checked ? await this.photos.put(checked.buffer, checked.mime) : null;
    const now = new Date();
    const retainUntil = new Date(now);
    retainUntil.setUTCMonth(retainUntil.getUTCMonth() + RETENTION_MONTHS);

    let handover: StoredHandover;
    try {
      handover = await runInTransaction(async (session) => {
        const held = await this.offers.holdIfClaimed(offer._id, session);
        if (!held || !(await this.claims.findActiveForOffer(offer._id, session))) {
          throw new InvalidStateError('Only a claimed offer can be handed over');
        }
        return this.handovers.create(
          {
            claimId: claim._id,
            offerId: offer._id,
            donorConfirmedByUserId: new Types.ObjectId(user.id),
            donorConfirmedAt: now,
            donorPhotoUrl: stored?.url ?? null,
            collectedQuantityKg: input.collectedQuantityKg,
            retainUntil,
          },
          session,
        );
      });
    } catch (err) {
      // the same confirmation arrived twice at once and the other request saved first
      if (isDuplicate(err, 'claimId')) {
        const won = await this.handovers.findByClaim(claim._id);
        if (won) return { created: false, response: await this.donorResponse(user, offer, won) };
      }
      throw err;
    }

    return { created: true, response: await this.donorResponse(user, offer, handover) };
  }

  /**
   * the route's ownership guard has checked the caller's organisation made the latest
   * claim. a retry after success gets the same answer
   */
  async recipientConfirm(
    user: SessionUser,
    offerId: string,
    input: RecipientConfirmRequest,
  ): Promise<RecipientConfirmResponse> {
    const offer = await this.offers.findById(offerId);
    if (!offer) throw new NotFoundError();
    const claim = await this.claims.latestForOffer(offer._id);
    if (!claim) throw new NotFoundError();
    const handover = await this.handovers.findByClaim(claim._id);
    if (!handover) throw new InvalidStateError('The donor has not confirmed the handover yet');
    if (handover.recipientConfirmedAt) return this.recipientResponse(offer, handover);
    if (offer.status !== 'claimed' || claim.status !== 'active') {
      throw new InvalidStateError('Only a claimed offer can be confirmed as received');
    }

    const confirmed = await runInTransaction(async (session) => {
      const updated = await this.handovers.confirmByRecipient(
        handover._id,
        {
          recipientConfirmedByUserId: new Types.ObjectId(user.id),
          recipientConfirmedAt: new Date(),
          conditionOnReceipt: input.conditionOnReceipt,
          conditionNotes: input.conditionNotes || null,
        },
        session,
      );
      // another request confirmed first
      if (!updated) return null;

      const fulfilled = await this.claims.fulfilIfActive(claim._id, session);
      const collected = await this.offers.collectIfClaimed(offer._id, session);
      if (!fulfilled || !collected) {
        throw new InvalidStateError('Only a claimed offer can be confirmed as received');
      }
      await this.organisations.updateStatus(
        claim.recipientOrganisationId,
        'verified',
        { status: nextStatus('verified', 'first_fulfilment') },
        session,
      );
      return { handover: updated, offer: collected };
    });

    if (!confirmed) {
      const [current, latest] = await Promise.all([
        this.handovers.findById(handover._id),
        this.offers.findById(offer._id),
      ]);
      if (!current || !latest) throw new NotFoundError();
      return this.recipientResponse(latest, current);
    }

    this.inBackground('notifying the handover', () =>
      this.notifications.notifyOrganisations(
        [confirmed.offer.donorOrganisationId.toString(), claim.recipientOrganisationId.toString()],
        'handover_confirmed',
        {
          reference: confirmed.offer.reference,
          quantityKg: confirmed.handover.collectedQuantityKg,
        },
        confirmed.offer.id,
      ),
    );
    return this.recipientResponse(confirmed.offer, confirmed.handover);
  }

  /** the two parties, coordinators and administrators. anyone else gets a missing record */
  async photoUrl(user: SessionUser, id: string): Promise<string> {
    const handover = await this.handovers.findById(id);
    if (!handover?.donorPhotoUrl) throw new NotFoundError();

    if (user.role === 'donor' || user.role === 'recipient') {
      const owner = await this.partyOf(user, handover);
      if (owner !== user.organisationId) throw new NotFoundError();
    }
    return this.photos.fullSizeUrl(handover.donorPhotoUrl);
  }

  /** handovers the recipient has confirmed. one still waiting on the recipient is not a dispute candidate */
  async list(query: ListHandoversQuery): Promise<HandoverListResponse> {
    const filter: Record<string, unknown> = { recipientConfirmedAt: { $ne: null } };
    if (query.condition) filter.conditionOnReceipt = query.condition;
    if (query.resolved !== undefined) filter.resolvedAt = query.resolved ? { $ne: null } : null;

    const handovers = await this.handovers.list(filter, LIST_LIMIT);
    const [offers, claims] = await Promise.all([
      this.offers.findByIds(handovers.map((h) => h.offerId)),
      this.claims.list({ _id: { $in: handovers.map((h) => h.claimId) } }, LIST_LIMIT),
    ]);
    const recipients = await this.organisations.findByIds(
      claims.map((c) => c.recipientOrganisationId),
    );

    const offerViews = new Map<string, Offer>(
      (await this.offerService.toViews(offers)).map((view) => [view.id, view]),
    );
    const recipientById = new Map(recipients.map((r) => [r.id, r]));
    const recipientOf = new Map(
      claims.map((c) => [c.id, recipientById.get(c.recipientOrganisationId.toString())]),
    );
    return {
      items: handovers.map((handover) => ({
        ...this.view(handover),
        offer: offerViews.get(handover.offerId.toString())!,
        recipient: organisationSummary(recipientOf.get(handover.claimId.toString())!),
      })),
    };
  }

  /** write-once. only a problem handover can be resolved */
  async resolve(
    user: SessionUser,
    id: string,
    input: ResolutionRequest,
  ): Promise<HandoverResponse> {
    const handover = await runInTransaction(async (session) => {
      const resolved = await this.handovers.resolveIfOpen(
        id,
        {
          resolvedAt: new Date(),
          resolvedByUserId: new Types.ObjectId(user.id),
          resolutionNote: input.resolutionNote,
        },
        session,
      );
      if (!resolved) {
        const current = await this.handovers.findById(id, session);
        if (!current) throw new NotFoundError();
        throw new InvalidStateError(
          current.resolvedAt
            ? 'This handover has already been resolved'
            : 'Only a problem handover can be resolved',
        );
      }
      await this.audit.record(
        user.id,
        'resolve_dispute',
        { type: AUDIT_TARGET, id: resolved._id },
        { note: input.resolutionNote, session },
      );
      return resolved;
    });
    return { handover: this.view(handover) };
  }

  /** for the ownership guard on donor-confirm */
  async donorOf(offerId: string) {
    const offer = await this.offers.findById(offerId);
    return offer ? offer.donorOrganisationId : null;
  }

  /** for the ownership guard on recipient-confirm. a released claim still belongs to its organisation */
  async claimantOf(offerId: string) {
    const claim = await this.claims.latestForOffer(offerId);
    return claim ? claim.recipientOrganisationId : null;
  }

  private async donorResponse(
    user: SessionUser,
    offer: StoredOffer,
    handover: StoredHandover,
  ): Promise<DonorConfirmResponse> {
    const shortfall = offer.offeredQuantityKg - handover.collectedQuantityKg;
    let remainderOffer: Offer | null = null;
    if (shortfall > 0) {
      const remainder = await this.offers.findRemainderOf(offer._id);
      // no remainder yet is a first confirmation, or a retry after the split failed
      remainderOffer = remainder
        ? ((await this.offerService.toViews([remainder]))[0] ?? null)
        : await this.offerService.splitRemainder(offer, user, shortfall);
    }
    return { handover: this.view(handover), remainderOffer };
  }

  private async recipientResponse(
    offer: StoredOffer,
    handover: StoredHandover,
  ): Promise<RecipientConfirmResponse> {
    const [view] = await this.offerService.toViews([offer]);
    return { handover: this.view(handover), offer: view! };
  }

  /** the organisation on the caller's side of the handover */
  private async partyOf(user: SessionUser, handover: StoredHandover): Promise<string | null> {
    if (user.role === 'donor') {
      const offer = await this.offers.findById(handover.offerId);
      return offer ? offer.donorOrganisationId.toString() : null;
    }
    const claim: StoredClaim | null = await this.claims.findById(handover.claimId);
    return claim ? claim.recipientOrganisationId.toString() : null;
  }

  private view(handover: StoredHandover) {
    return handoverView(
      handover,
      handover.donorPhotoUrl ? this.photos.thumbnailUrl(handover.donorPhotoUrl) : null,
    );
  }

  private inBackground(what: string, work: () => Promise<unknown>) {
    work().catch((err: unknown) => this.logger.error({ err }, `${what} failed`));
  }
}
