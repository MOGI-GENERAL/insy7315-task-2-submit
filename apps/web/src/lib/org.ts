import { suburbLocation, type GeoPoint, type VerificationDecision } from '@fedsa/contract';
import type { ColdChain, Organisation, OrganisationStatus } from '../store/types';

const FEDSA_OFFICE = suburbLocation('Salt River');

export function storageList(
  org: Pick<Organisation, 'storageAmbient' | 'storageRefrigerated' | 'storageFrozen'>,
): ColdChain[] {
  const list: ColdChain[] = [];
  if (org.storageAmbient) list.push('ambient');
  if (org.storageRefrigerated) list.push('refrigerated');
  if (org.storageFrozen) list.push('frozen');
  return list;
}

export function storageFields(list: ColdChain[]) {
  return {
    storageAmbient: list.includes('ambient'),
    storageRefrigerated: list.includes('refrigerated'),
    storageFrozen: list.includes('frozen'),
  };
}

export function canStore(org: Organisation, coldChain: ColdChain): boolean {
  return storageList(org).includes(coldChain);
}

/** straight-line km to one decimal */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const [lng1, lat1] = a.coordinates;
  const [lng2, lat2] = b.coordinates;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export function distanceFromOffice(org: { location: GeoPoint }): number {
  return distanceKm(FEDSA_OFFICE, org.location);
}

/** the coordinator's verification decisions. any pair not listed is refused */
export function nextStatus(
  from: OrganisationStatus,
  decision: VerificationDecision,
  hasFulfilledClaim: boolean,
): OrganisationStatus | null {
  if (decision === 'verify' && (from === 'pending' || from === 'rejected')) return 'verified';
  if (decision === 'reject' && from === 'pending') return 'rejected';
  if (decision === 'suspend' && (from === 'verified' || from === 'active')) return 'suspended';
  if (decision === 'reinstate' && from === 'suspended')
    return hasFulfilledClaim ? 'active' : 'verified';
  return null;
}

/** `verified` and `active` recipients can claim */
export function canClaim(org: { status: OrganisationStatus }): boolean {
  return org.status === 'verified' || org.status === 'active';
}
