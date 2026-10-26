import { objectId, type OfferView, type Role } from '@fedsa/contract';
import { Types } from 'mongoose';
import type { ClaimRepository, OrganisationRepository } from '../db/index.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { isEligible, nearbyDonorsFilter, offersForRecipientFilter } from './eligibility.js';
import {
  findOrganisation,
  type StoredClaim,
  type StoredOffer,
  type StoredOrganisation,
} from './offer-records.js';
import { canClaim } from './organisation-status.js';
import type { SessionUser } from './user-service.js';

const VIEW_ROLES: Record<OfferView, Role[]> = {
  feed: ['recipient'],
  scheduled: ['recipient'],
  mine: ['donor'],
  all: ['coordinator'],
};

/** null when the caller has nothing to see in the view */
export async function viewFilter(
  organisations: OrganisationRepository,
  radiusKm: number,
  user: SessionUser,
  view: OfferView,
): Promise<Record<string, unknown> | null> {
  if (!VIEW_ROLES[view].includes(user.role)) {
    throw new ForbiddenError(`The ${view} view is not available to your role`);
  }
  if (view === 'all') return {};
  if (view === 'mine') return { donorOrganisationId: new Types.ObjectId(user.organisationId!) };

  // pending, rejected and suspended recipients have not been vetted, so they see no offers
  const recipient = await findOrganisation(organisations, user.organisationId);
  if (!canClaim(recipient)) return null;

  const donorIds = await organisations.idsMatching(
    nearbyDonorsFilter(recipient.location.coordinates, radiusKm),
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
export async function claimOf(
  claims: ClaimRepository,
  organisations: OrganisationRepository,
  radiusKm: number,
  user: SessionUser,
  offer: StoredOffer,
  donor: StoredOrganisation,
): Promise<StoredClaim | null> {
  if (user.role === 'coordinator') return claims.latestForOffer(offer._id);
  if (user.role === 'donor') {
    if (offer.donorOrganisationId.toString() !== user.organisationId) throw new NotFoundError();
    return claims.latestForOffer(offer._id);
  }

  const recipient = await findOrganisation(organisations, user.organisationId);
  const own = await claims.latestForOffer(offer._id, recipient._id);
  if (own) return own;
  if (!isEligible(recipient, offer, donor.location.coordinates, radiusKm)) {
    throw new NotFoundError();
  }
  return null;
}

export function parseCursor(cursor: string) {
  if (!objectId.safeParse(cursor).success) {
    throw new ValidationError({ cursor: 'Not a cursor from a previous page' });
  }
  return new Types.ObjectId(cursor);
}
