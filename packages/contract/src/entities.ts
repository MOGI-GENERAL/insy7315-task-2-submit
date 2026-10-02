import { z } from 'zod';
import { GeoPoint, isoDateTime, objectId } from './common.js';
import {
  AuditAction,
  ClaimStatus,
  ColdChain,
  CollectionStatus,
  Condition,
  DeliveryStatus,
  FoodCategory,
  Language,
  NotificationChannel,
  NotificationKind,
  OfferStatus,
  OrganisationStatus,
  Role,
  UserStatus,
} from './enums.js';

const OrganisationBase = z.object({
  id: objectId,
  name: z.string(),
  status: OrganisationStatus,
  addressLine: z.string(),
  suburb: z.string(),
  city: z.string(),
  location: GeoPoint,
  contactName: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string(),
  verifiedAt: isoDateTime.nullable(),
  /** coordinator and administrator responses only */
  capacityNotes: z.string().optional(),
  createdAt: isoDateTime,
});

export const DonorOrganisation = OrganisationBase.extend({
  type: z.literal('donor'),
  taxReferenceNumber: z.string().nullable(),
});
export type DonorOrganisation = z.infer<typeof DonorOrganisation>;

export const RecipientOrganisation = OrganisationBase.extend({
  type: z.literal('recipient'),
  storageAmbient: z.boolean(),
  storageRefrigerated: z.boolean(),
  storageFrozen: z.boolean(),
  /** null means no limit */
  maxCapacityKg: z.number().nullable(),
  hasTransport: z.boolean(),
  mealsPerDay: z.number().nullable(),
});
export type RecipientOrganisation = z.infer<typeof RecipientOrganisation>;

export const Organisation = z.discriminatedUnion('type', [
  DonorOrganisation,
  RecipientOrganisation,
]);
export type Organisation = z.infer<typeof Organisation>;

/** what one party sees of another organisation */
export const OrganisationSummary = z.object({
  id: objectId,
  name: z.string(),
  suburb: z.string(),
  location: GeoPoint,
});
export type OrganisationSummary = z.infer<typeof OrganisationSummary>;

export const OrganisationStats = z.object({
  offersPosted: z.number().int(),
  claimsMade: z.number().int(),
  claimsReleased: z.number().int(),
  kgCollected: z.number(),
});
export type OrganisationStats = z.infer<typeof OrganisationStats>;

export const User = z.object({
  id: objectId,
  organisationId: objectId.nullable(),
  role: Role,
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  languagePreference: Language,
  status: UserStatus,
  mustChangePassword: z.boolean(),
  lastLoginAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type User = z.infer<typeof User>;

/** lists carry `thumbUrl` only (NFR03) */
export const Photo = z.object({
  thumbUrl: z.url(),
  url: z.url().optional(),
});
export type Photo = z.infer<typeof Photo>;

export const Offer = z.object({
  id: objectId,
  reference: z.string(),
  donorOrganisationId: objectId,
  donor: OrganisationSummary,
  postedByUserId: objectId,
  title: z.string(),
  description: z.string().nullable(),
  category: FoodCategory,
  offeredQuantityKg: z.number(),
  coldChain: ColdChain,
  photos: z.array(Photo).max(2),
  availableFrom: isoDateTime,
  collectionDeadline: isoDateTime,
  status: OfferStatus,
  expiredAt: isoDateTime.nullable(),
  parentOfferId: objectId.nullable(),
  createdAt: isoDateTime,
});
export type Offer = z.infer<typeof Offer>;

export const Claim = z.object({
  id: objectId,
  offerId: objectId,
  recipientOrganisationId: objectId,
  recipient: OrganisationSummary,
  claimedByUserId: objectId,
  claimedAt: isoDateTime,
  transportNeeded: z.boolean(),
  status: ClaimStatus,
  releasedAt: isoDateTime.nullable(),
  releaseReason: z.string().nullable(),
});
export type Claim = z.infer<typeof Claim>;

export const DonorContact = z.object({
  name: z.string(),
  phone: z.string(),
  addressLine: z.string(),
  suburb: z.string(),
});
export type DonorContact = z.infer<typeof DonorContact>;

export const Collection = z.object({
  id: objectId,
  claimId: objectId,
  dispatchedByUserId: objectId,
  driverName: z.string(),
  driverPhone: z.string(),
  dispatchedAt: isoDateTime,
  scheduledFor: isoDateTime.nullable(),
  status: CollectionStatus,
});
export type Collection = z.infer<typeof Collection>;

export const Handover = z.object({
  id: objectId,
  claimId: objectId,
  offerId: objectId,
  donorConfirmedByUserId: objectId,
  donorConfirmedAt: isoDateTime,
  collectedQuantityKg: z.number(),
  /** null once the retention sweep deletes the photo. the full image is only at `GET /api/handovers/:id/photo` */
  donorPhotoThumbUrl: z.url().nullable(),
  recipientConfirmedByUserId: objectId.nullable(),
  recipientConfirmedAt: isoDateTime.nullable(),
  conditionOnReceipt: Condition.nullable(),
  conditionNotes: z.string().nullable(),
  retainUntil: isoDateTime,
  resolvedAt: isoDateTime.nullable(),
  resolvedByUserId: objectId.nullable(),
  resolutionNote: z.string().nullable(),
});
export type Handover = z.infer<typeof Handover>;

/** `title` and `body` are rendered in the user's language at send time */
export const Notification = z.object({
  id: objectId,
  kind: NotificationKind,
  channel: NotificationChannel,
  offerId: objectId.nullable(),
  title: z.string(),
  body: z.string(),
  href: z.string().nullable(),
  deliveryStatus: DeliveryStatus,
  readAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Notification = z.infer<typeof Notification>;

/** a null `updatedByUserId` marks a seeded placeholder rate */
export const ValuationRate = z.object({
  category: FoodCategory,
  ratePerKg: z.number(),
  updatedAt: isoDateTime,
  updatedByUserId: objectId.nullable(),
});
export type ValuationRate = z.infer<typeof ValuationRate>;

export const ValuationLine = z.object({
  category: FoodCategory,
  quantityKg: z.number(),
  ratePerKg: z.number(),
  value: z.number(),
});
export type ValuationLine = z.infer<typeof ValuationLine>;

export const TaxCertificate = z.object({
  id: objectId,
  certificateNumber: z.string(),
  donorOrganisationId: objectId,
  periodStart: isoDateTime,
  periodEnd: isoDateTime,
  handoverRecordIds: z.array(objectId).min(1),
  totalQuantityKg: z.number(),
  valuationByCategory: z.array(ValuationLine),
  totalValue: z.number(),
  issuedAt: isoDateTime,
});
export type TaxCertificate = z.infer<typeof TaxCertificate>;

export const AuditEntry = z.object({
  id: objectId,
  userId: objectId,
  action: AuditAction,
  targetType: z.string(),
  targetId: objectId,
  note: z.string().nullable(),
  at: isoDateTime,
});
export type AuditEntry = z.infer<typeof AuditEntry>;
