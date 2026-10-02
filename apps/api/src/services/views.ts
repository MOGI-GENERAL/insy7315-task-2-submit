import type { GeoPoint, Organisation, User } from '@fedsa/contract';
import type { Types } from 'mongoose';
import type { OrganisationDoc, UserDoc } from '../db/index.js';

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
