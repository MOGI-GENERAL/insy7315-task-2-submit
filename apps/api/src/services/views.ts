import type {
  Claim,
  Collection,
  GeoPoint,
  Handover,
  Notification,
  Offer,
  Organisation,
  OrganisationSummary,
  Photo,
  User,
} from '@fedsa/contract';
import type { Types } from 'mongoose';
import type {
  ClaimDoc,
  CollectionDoc,
  HandoverRecordDoc,
  NotificationDoc,
  OfferDoc,
  OrganisationDoc,
  UserDoc,
} from '../db/index.js';

type Stored<T> = T & { _id: Types.ObjectId; createdAt: Date };

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

/** leaves out `passwordHash`, consent and push subscriptions */
export function userView(user: Stored<UserDoc>): User {
  return {
    id: user._id.toString(),
    organisationId: user.organisationId ? user.organisationId.toString() : null,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    languagePreference: user.languagePreference,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
  };
}

/** leaves out `capacityNotes`, so it is safe to send to the organisation's own users */
export function organisationView(organisation: Stored<OrganisationDoc>): Organisation {
  const base = {
    id: organisation._id.toString(),
    name: organisation.name,
    status: organisation.status,
    addressLine: organisation.addressLine,
    suburb: organisation.suburb,
    city: organisation.city,
    location: {
      type: 'Point',
      coordinates: [organisation.location.coordinates[0]!, organisation.location.coordinates[1]!],
    } satisfies GeoPoint,
    contactName: organisation.contactName,
    contactPhone: organisation.contactPhone,
    contactEmail: organisation.contactEmail,
    verifiedAt: iso(organisation.verifiedAt),
    createdAt: organisation.createdAt.toISOString(),
  };

  if (organisation.type === 'donor') {
    return {
      ...base,
      type: 'donor',
      taxReferenceNumber: organisation.taxReferenceNumber ?? null,
    };
  }
  return {
    ...base,
    type: 'recipient',
    storageAmbient: organisation.storageAmbient ?? false,
    storageRefrigerated: organisation.storageRefrigerated ?? false,
    storageFrozen: organisation.storageFrozen ?? false,
    maxCapacityKg: organisation.maxCapacityKg ?? null,
    hasTransport: organisation.hasTransport ?? false,
    mealsPerDay: organisation.mealsPerDay ?? null,
  };
}

/** adds `capacityNotes`, so only coordinators and administrators may receive it */
export function organisationStaffView(organisation: Stored<OrganisationDoc>): Organisation {
  return { ...organisationView(organisation), capacityNotes: organisation.capacityNotes ?? '' };
}

export function organisationSummary(organisation: Stored<OrganisationDoc>): OrganisationSummary {
  const { id, name, suburb, location } = organisationView(organisation);
  return { id, name, suburb, location };
}

/** the caller builds `photos`, because lists carry thumbnails only (NFR03) */
export function offerView(
  offer: Stored<OfferDoc>,
  donor: Stored<OrganisationDoc>,
  photos: Photo[],
): Offer {
  return {
    id: offer._id.toString(),
    reference: offer.reference,
    donorOrganisationId: offer.donorOrganisationId.toString(),
    donor: organisationSummary(donor),
    postedByUserId: offer.postedByUserId.toString(),
    title: offer.title,
    description: offer.description ?? null,
    category: offer.category,
    offeredQuantityKg: offer.offeredQuantityKg,
    coldChain: offer.coldChain,
    photos,
    availableFrom: offer.availableFrom.toISOString(),
    collectionDeadline: offer.collectionDeadline.toISOString(),
    status: offer.status,
    expiredAt: iso(offer.expiredAt),
    parentOfferId: offer.parentOfferId ? offer.parentOfferId.toString() : null,
    createdAt: offer.createdAt.toISOString(),
  };
}

export function claimView(claim: Stored<ClaimDoc>, recipient: Stored<OrganisationDoc>): Claim {
  return {
    id: claim._id.toString(),
    offerId: claim.offerId.toString(),
    recipientOrganisationId: claim.recipientOrganisationId.toString(),
    recipient: organisationSummary(recipient),
    claimedByUserId: claim.claimedByUserId.toString(),
    claimedAt: claim.claimedAt.toISOString(),
    transportNeeded: claim.transportNeeded,
    status: claim.status,
    releasedAt: iso(claim.releasedAt),
    releaseReason: claim.releaseReason ?? null,
  };
}

export function collectionView(collection: Stored<CollectionDoc>): Collection {
  return {
    id: collection._id.toString(),
    claimId: collection.claimId.toString(),
    dispatchedByUserId: collection.dispatchedByUserId.toString(),
    driverName: collection.driverName,
    driverPhone: collection.driverPhone,
    dispatchedAt: collection.dispatchedAt.toISOString(),
    scheduledFor: iso(collection.scheduledFor),
    status: collection.status,
  };
}

/** the full photo is never included. it is only reachable through its own route (NFR03) */
export function handoverView(
  handover: Stored<HandoverRecordDoc>,
  donorPhotoThumbUrl: string | null,
): Handover {
  return {
    id: handover._id.toString(),
    claimId: handover.claimId.toString(),
    offerId: handover.offerId.toString(),
    donorConfirmedByUserId: handover.donorConfirmedByUserId.toString(),
    donorConfirmedAt: handover.donorConfirmedAt.toISOString(),
    collectedQuantityKg: handover.collectedQuantityKg,
    donorPhotoThumbUrl,
    recipientConfirmedByUserId: handover.recipientConfirmedByUserId
      ? handover.recipientConfirmedByUserId.toString()
      : null,
    recipientConfirmedAt: iso(handover.recipientConfirmedAt),
    conditionOnReceipt: handover.conditionOnReceipt ?? null,
    conditionNotes: handover.conditionNotes ?? null,
    retainUntil: handover.retainUntil.toISOString(),
    resolvedAt: iso(handover.resolvedAt),
    resolvedByUserId: handover.resolvedByUserId ? handover.resolvedByUserId.toString() : null,
    resolutionNote: handover.resolutionNote ?? null,
  };
}

export function notificationView(notification: Stored<NotificationDoc>): Notification {
  return {
    id: notification._id.toString(),
    kind: notification.kind,
    channel: notification.channel,
    offerId: notification.offerId ? notification.offerId.toString() : null,
    title: notification.title,
    body: notification.body,
    href: notification.href ?? null,
    deliveryStatus: notification.deliveryStatus,
    readAt: iso(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
  };
}
