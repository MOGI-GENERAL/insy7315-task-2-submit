import type * as C from '@fedsa/contract';
import type {
  AppNotification,
  AuditEntry,
  AppState,
  Claim,
  Collection,
  HandoverRecord,
  Offer,
  Organisation,
  TaxCertificate,
  User,
} from '../../store/types';

/*
 * turns the prototype's records into contract shapes. ids and photo URLs are not real ones,
 * which is fine because nothing parses a fake response
 */

const FAKE_PHOTO_ORIGIN = 'https://photos.fake.invalid/';
const RETENTION_MS = 730 * 86_400_000;

export const fakeEmail = (user: User) => `${user.name.split(' ')[0].toLowerCase()}@example.org`;

export const fakePhotoUrl = (key: string) => `${FAKE_PHOTO_ORIGIN}${key}`;

/** the illustration key behind a fake photo URL, for `FoodPhoto` */
export function photoKeyFromUrl(url: string | null | undefined): string | null {
  return url?.startsWith(FAKE_PHOTO_ORIGIN) ? url.slice(FAKE_PHOTO_ORIGIN.length) : null;
}

export function toSummary(org: Organisation): C.OrganisationSummary {
  return { id: org.id, name: org.name, suburb: org.suburb, location: org.location };
}

export function toOrganisation(org: Organisation, staff: boolean): C.Organisation {
  const base = {
    id: org.id,
    name: org.name,
    status: org.status,
    addressLine: org.suburb,
    suburb: org.suburb,
    city: 'Cape Town',
    location: org.location,
    contactName: org.contactName,
    contactPhone: org.contactPhone,
    contactEmail: `${org.id.replace(/^org-/, '')}@example.org`,
    verifiedAt: org.status === 'verified' || org.status === 'active' ? org.joinedAt : null,
    ...(staff ? { capacityNotes: org.capacityNotes } : {}),
    createdAt: org.joinedAt,
  };
  if (org.type === 'donor') return { ...base, type: 'donor', taxReferenceNumber: null };
  return {
    ...base,
    type: 'recipient',
    storageAmbient: Boolean(org.storageAmbient),
    storageRefrigerated: Boolean(org.storageRefrigerated),
    storageFrozen: Boolean(org.storageFrozen),
    maxCapacityKg: org.maxCapacityKg ?? null,
    hasTransport: Boolean(org.hasTransport),
    mealsPerDay: org.mealsPerDay ?? null,
  };
}

export function toUser(user: User, state: AppState): C.User {
  const org = state.organisations.find((o) => o.id === user.organisationId);
  return {
    id: user.id,
    organisationId: user.organisationId,
    role: user.role,
    fullName: user.name,
    email: fakeEmail(user),
    phone: org?.contactPhone ?? '+27214480000',
    languagePreference: user.language,
    status: user.active ? 'active' : 'disabled',
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: org?.joinedAt ?? '2025-01-01T00:00:00.000Z',
  };
}

export function toOffer(offer: Offer, state: AppState, detail = false): C.Offer {
  const donor = state.organisations.find((o) => o.id === offer.donorOrganisationId)!;
  return {
    id: offer.id,
    reference: offer.reference,
    donorOrganisationId: offer.donorOrganisationId,
    donor: toSummary(donor),
    postedByUserId: offer.postedByUserId,
    title: offer.title,
    description: offer.description || null,
    category: offer.category,
    offeredQuantityKg: offer.offeredQuantityKg,
    coldChain: offer.coldChain,
    photos: offer.photo
      ? [
          {
            thumbUrl: fakePhotoUrl(offer.photo),
            ...(detail ? { url: fakePhotoUrl(offer.photo) } : {}),
          },
        ]
      : [],
    availableFrom: offer.availableFrom,
    collectionDeadline: offer.collectionDeadline,
    status: offer.status,
    expiredAt: offer.expiredAt,
    parentOfferId: offer.parentOfferId,
    createdAt: offer.createdAt,
  };
}

export function toClaim(claim: Claim, state: AppState): C.Claim {
  const recipient = state.organisations.find((o) => o.id === claim.recipientOrganisationId)!;
  return {
    id: claim.id,
    offerId: claim.offerId,
    recipientOrganisationId: claim.recipientOrganisationId,
    recipient: toSummary(recipient),
    claimedByUserId: claim.claimedByUserId,
    claimedAt: claim.claimedAt,
    transportNeeded: claim.transportNeeded,
    status: claim.status,
    releasedAt: claim.releasedAt,
    releaseReason: claim.releaseReason,
  };
}

export function toCollection(collection: Collection): C.Collection {
  return { ...collection, scheduledFor: collection.scheduledFor ?? null };
}

export function toHandover(handover: HandoverRecord, state: AppState): C.Handover {
  const claim = state.claims.find((c) => c.id === handover.claimId)!;
  return {
    id: handover.id,
    claimId: handover.claimId,
    offerId: claim.offerId,
    donorConfirmedByUserId: handover.donorConfirmedByUserId,
    donorConfirmedAt: handover.donorConfirmedAt,
    collectedQuantityKg: handover.collectedQuantityKg,
    donorPhotoThumbUrl: handover.donorPhoto ? fakePhotoUrl(handover.donorPhoto) : null,
    recipientConfirmedByUserId: handover.recipientConfirmedByUserId,
    recipientConfirmedAt: handover.recipientConfirmedAt,
    conditionOnReceipt: handover.conditionOnReceipt,
    conditionNotes: handover.conditionNotes,
    retainUntil: new Date(
      new Date(handover.donorConfirmedAt).getTime() + RETENTION_MS,
    ).toISOString(),
    resolvedAt: handover.resolvedAt,
    resolvedByUserId: handover.resolvedByUserId,
    resolutionNote: handover.resolutionNote,
  };
}

export function toNotification(n: AppNotification): C.Notification {
  const offerId = n.href?.match(/\/offers\/([^/]+)/)?.[1] ?? null;
  return {
    id: n.id,
    kind: n.kind,
    channel: n.channel,
    offerId,
    title: n.title,
    body: n.body,
    href: n.href,
    deliveryStatus: 'delivered',
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

const AUDIT_ACTIONS: [RegExp, C.AuditAction][] = [
  [/^(Verified organisation|Organisation verified)/, 'verify_organisation'],
  [/^Organisation rejected/, 'reject_organisation'],
  [/^Organisation suspended/, 'suspend_organisation'],
  [/^Organisation reinstated/, 'reinstate_organisation'],
  [/^Updated capacity notes/, 'update_capacity_notes'],
  [/^Created account/, 'create_user'],
  [/^Changed role/, 'change_role'],
  [/^Disabled account/, 'disable_user'],
  [/^Enabled account/, 'enable_user'],
  [/^Reset password/, 'reset_password'],
  [/^Issued tax certificate/, 'issue_certificate'],
  [/^Resolved dispute/, 'resolve_dispute'],
];

/** the prototype logged free text. entries no action matches are left out */
export function toAuditEntry(entry: AuditEntry): C.AuditEntry | null {
  const action = AUDIT_ACTIONS.find(([pattern]) => pattern.test(entry.action))?.[1];
  if (!action) return null;
  return {
    id: entry.id,
    userId: entry.actorUserId,
    action,
    targetType: entry.target,
    targetId: entry.id,
    note: entry.detail,
    at: entry.at,
  };
}

export function toCertificate(cert: TaxCertificate): C.TaxCertificate {
  const lines = cert.valuationByCategory.map((line) => ({
    category: line.category,
    quantityKg: line.kg,
    ratePerKg: line.kg > 0 ? Math.round((line.valueZar / line.kg) * 100) / 100 : 0,
    value: line.valueZar,
  }));
  return {
    id: cert.id,
    certificateNumber: cert.reference,
    donorOrganisationId: cert.donorOrganisationId,
    periodStart: cert.periodStart,
    periodEnd: cert.periodEnd,
    handoverRecordIds: cert.handoverRecordIds,
    totalQuantityKg: cert.totalKg,
    valuationByCategory: lines,
    totalValue: lines.reduce((sum, l) => sum + l.value, 0),
    issuedAt: cert.issuedAt ?? cert.periodEnd,
  };
}
