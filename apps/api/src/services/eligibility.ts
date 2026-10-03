import type { ColdChain, OrganisationStatus, OrganisationType } from '@fedsa/contract';
import { CLAIMING_STATUSES, canClaim } from './organisation-status.js';

export const DEFAULT_RADIUS_KM = 15;

/** the radius MongoDB uses for `$centerSphere`, so the query and `distanceKm` agree */
const EARTH_RADIUS_KM = 6378.1;

type StorageField = 'storageAmbient' | 'storageRefrigerated' | 'storageFrozen';

const STORAGE_FOR: Record<ColdChain, StorageField> = {
  ambient: 'storageAmbient',
  refrigerated: 'storageRefrigerated',
  frozen: 'storageFrozen',
};

/** longitude first, as GeoJSON stores it */
type Coordinates = number[];

export interface RecipientProfile {
  type: OrganisationType;
  status: OrganisationStatus;
  storageAmbient?: boolean | null;
  storageRefrigerated?: boolean | null;
  storageFrozen?: boolean | null;
  maxCapacityKg?: number | null;
  location: { coordinates: Coordinates };
}

export interface OfferNeeds {
  coldChain: ColdChain;
  offeredQuantityKg: number;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** great-circle distance */
export function distanceKm([lng1, lat1]: Coordinates, [lng2, lat2]: Coordinates) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function withinRadius(centre: Coordinates, radiusKm: number) {
  return { $geoWithin: { $centerSphere: [centre, radiusKm / EARTH_RADIUS_KM] } };
}

/** transport never counts. an organisation without a vehicle can still claim and ask for transport */
export function isEligible(
  recipient: RecipientProfile,
  offer: OfferNeeds,
  donorLocation: Coordinates,
  radiusKm: number,
) {
  return (
    canClaim(recipient) &&
    recipient[STORAGE_FOR[offer.coldChain]] === true &&
    (recipient.maxCapacityKg == null || recipient.maxCapacityKg >= offer.offeredQuantityKg) &&
    distanceKm(recipient.location.coordinates, donorLocation) <= radiusKm
  );
}

/** the same rule as `isEligible`, as an organisations query */
export function eligibleRecipientsFilter(
  offer: OfferNeeds,
  donorLocation: Coordinates,
  radiusKm: number,
) {
  return {
    type: 'recipient',
    status: { $in: [...CLAIMING_STATUSES] },
    [STORAGE_FOR[offer.coldChain]]: true,
    $or: [{ maxCapacityKg: null }, { maxCapacityKg: { $gte: offer.offeredQuantityKg } }],
    location: withinRadius(donorLocation, radiusKm),
  };
}

/** distance is the same both ways, so the donors near a recipient are the ones it is near */
export function nearbyDonorsFilter(recipientLocation: Coordinates, radiusKm: number) {
  return { type: 'donor', location: withinRadius(recipientLocation, radiusKm) };
}

/** the storage and capacity half of the rule, as an offers query for one recipient */
export function offersForRecipientFilter(recipient: RecipientProfile) {
  const coldChains = (Object.keys(STORAGE_FOR) as ColdChain[]).filter(
    (coldChain) => recipient[STORAGE_FOR[coldChain]] === true,
  );
  return {
    coldChain: { $in: coldChains },
    ...(recipient.maxCapacityKg == null
      ? {}
      : { offeredQuantityKg: { $lte: recipient.maxCapacityKg } }),
  };
}
