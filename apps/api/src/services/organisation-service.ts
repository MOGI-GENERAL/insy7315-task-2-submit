import {
  SUBURBS,
  suburbLocation,
  type AuditAction,
  type CapacityNotesRequest,
  type ListOrganisationsQuery,
  type OrganisationDetailResponse,
  type OrganisationListResponse,
  type OrganisationResponse,
  type OrganisationStats,
  type OrganisationType,
  type UpdateDonorOrganisationRequest,
  type UpdateRecipientOrganisationRequest,
  type VerificationDecision,
  type VerificationRequest,
} from '@fedsa/contract';
import { Types, type ClientSession } from 'mongoose';
import {
  runInTransaction,
  type ClaimRepository,
  type HandoverRepository,
  type OfferRepository,
  type OrganisationDoc,
  type OrganisationRepository,
} from '../db/index.js';
import { InvalidStateError, NotFoundError } from '../errors.js';
import type { AuditService } from './audit-service.js';
import { hasTransition, nextStatus } from './organisation-status.js';
import { organisationStaffView, organisationView } from './views.js';

type ProfileUpdate = UpdateDonorOrganisationRequest | UpdateRecipientOrganisationRequest;

const DECISION_ACTIONS: Record<VerificationDecision, AuditAction> = {
  verify: 'verify_organisation',
  reject: 'reject_organisation',
  suspend: 'suspend_organisation',
  reinstate: 'reinstate_organisation',
};

const AUDIT_TARGET = 'organisations';

const SHARED_FIELDS = ['name', 'addressLine', 'contactName', 'contactPhone', 'contactEmail'];
const RECIPIENT_FIELDS = [
  'storageAmbient',
  'storageRefrigerated',
  'storageFrozen',
  'maxCapacityKg',
  'hasTransport',
  'mealsPerDay',
];

/** a field of the other organisation type is never copied, even if it reaches here */
function profileChanges(type: OrganisationType, input: ProfileUpdate): Partial<OrganisationDoc> {
  const fields: Record<string, unknown> = input;
  const changes: Record<string, unknown> = {};
  const allowed = type === 'recipient' ? [...SHARED_FIELDS, ...RECIPIENT_FIELDS] : SHARED_FIELDS;
  for (const field of allowed) {
    if (fields[field] !== undefined) changes[field] = fields[field];
  }

  if (input.suburb !== undefined) {
    const suburb = SUBURBS.find((s) => s.name === input.suburb)!;
    changes.suburb = suburb.name;
    changes.city = suburb.city;
    changes.location = suburbLocation(suburb.name);
  }
  if (type === 'donor' && fields.taxReferenceNumber !== undefined) {
    changes.taxReferenceNumber = fields.taxReferenceNumber || null;
  }
  return changes as Partial<OrganisationDoc>;
}

export class OrganisationService {
  private readonly organisations: OrganisationRepository;
  private readonly offers: OfferRepository;
  private readonly claims: ClaimRepository;
  private readonly handovers: HandoverRepository;
  private readonly audit: AuditService;

  constructor(
    organisations: OrganisationRepository,
    offers: OfferRepository,
    claims: ClaimRepository,
    handovers: HandoverRepository,
    audit: AuditService,
  ) {
    this.organisations = organisations;
    this.offers = offers;
    this.claims = claims;
    this.handovers = handovers;
    this.audit = audit;
  }

  async getOwn(organisationId: string | null): Promise<OrganisationResponse> {
    const organisation = await this.findOrThrow(organisationId);
    return { organisation: organisationView(organisation) };
  }

  async updateOwn(
    organisationId: string | null,
    input: ProfileUpdate,
  ): Promise<OrganisationResponse> {
    const organisation = await this.findOrThrow(organisationId);
    const changes = profileChanges(organisation.type, input);
    if (Object.keys(changes).length === 0) return { organisation: organisationView(organisation) };

    const updated = await this.organisations.updateProfile(organisation._id, changes);
    if (!updated) throw new NotFoundError();
    return { organisation: organisationView(updated) };
  }

  async list(query: ListOrganisationsQuery): Promise<OrganisationListResponse> {
    const items = await this.organisations.list(query);
    return { items: items.map(organisationStaffView), total: items.length };
  }

  async get(id: string): Promise<OrganisationDetailResponse> {
    const organisation = await this.findOrThrow(id);
    return {
      organisation: organisationStaffView(organisation),
      stats: await this.stats(organisation._id, organisation.type),
    };
  }

  async decide(
    id: string,
    coordinatorId: string,
    input: VerificationRequest,
  ): Promise<OrganisationResponse> {
    const organisation = await this.findOrThrow(id);
    if (organisation.type !== 'recipient') {
      throw new InvalidStateError('Only recipient organisations go through verification');
    }

    const hasFulfilledClaim = await this.claims.hasFulfilled(organisation._id);
    const changes: Partial<OrganisationDoc> = {
      status: nextStatus(organisation.status, input.decision, hasFulfilledClaim),
    };
    if (input.decision === 'verify') {
      changes.verifiedAt = new Date();
      changes.verifiedByUserId = new Types.ObjectId(coordinatorId);
    }

    return runInTransaction(async (session) => {
      const updated = await this.organisations.updateStatus(
        organisation._id,
        organisation.status,
        changes,
        session,
      );
      // another coordinator changed the status first
      if (!updated) throw new InvalidStateError();

      await this.audit.record(
        coordinatorId,
        DECISION_ACTIONS[input.decision],
        { type: AUDIT_TARGET, id: updated._id },
        { note: input.note || null, session },
      );
      return { organisation: organisationStaffView(updated) };
    });
  }

  async replaceNotes(
    id: string,
    coordinatorId: string,
    input: CapacityNotesRequest,
  ): Promise<OrganisationResponse> {
    return runInTransaction(async (session) => {
      const updated = await this.organisations.updateCapacityNotes(
        id,
        input.capacityNotes,
        session,
      );
      if (!updated) throw new NotFoundError();

      await this.audit.record(
        coordinatorId,
        'update_capacity_notes',
        { type: AUDIT_TARGET, id: updated._id },
        { session },
      );
      return { organisation: organisationStaffView(updated) };
    });
  }

  /**
   * for the handover confirmation to call inside its transaction. an organisation
   * that is already active, or suspended meanwhile, is left as it is
   */
  async recordFirstFulfilment(organisationId: Types.ObjectId | string, session: ClientSession) {
    const organisation = await this.organisations.findById(organisationId, session);
    if (!organisation || !hasTransition(organisation.status, 'first_fulfilment')) return;

    await this.organisations.updateStatus(
      organisation._id,
      organisation.status,
      { status: nextStatus(organisation.status, 'first_fulfilment') },
      session,
    );
  }

  private async stats(id: Types.ObjectId, type: OrganisationType): Promise<OrganisationStats> {
    const [offersPosted, claimsMade, claimsReleased] = await Promise.all([
      this.offers.countByDonor(id),
      this.claims.countByRecipient(id),
      this.claims.countByRecipient(id, 'released'),
    ]);
    const kgCollected =
      type === 'donor'
        ? await this.handovers.totalCollectedKg('offerId', await this.offers.idsForDonor(id))
        : await this.handovers.totalCollectedKg('claimId', await this.claims.idsForRecipient(id));
    return { offersPosted, claimsMade, claimsReleased, kgCollected };
  }

  private async findOrThrow(id: Types.ObjectId | string | null) {
    const organisation = id ? await this.organisations.findById(id) : null;
    if (!organisation) throw new NotFoundError();
    return organisation;
  }
}
