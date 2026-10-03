import { OrganisationStatus, suburbLocation } from '@fedsa/contract';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RADIUS_KM,
  distanceKm,
  eligibleRecipientsFilter,
  isEligible,
  nearbyDonorsFilter,
  offersForRecipientFilter,
  type OfferNeeds,
  type RecipientProfile,
} from './eligibility.js';

const DONOR = suburbLocation('Woodstock').coordinates;

/** a verified shelter a few kilometres from the donor, with every kind of storage and no limit */
function recipient(overrides: Partial<RecipientProfile> = {}): RecipientProfile {
  return {
    type: 'recipient',
    status: 'verified',
    storageAmbient: true,
    storageRefrigerated: true,
    storageFrozen: true,
    maxCapacityKg: null,
    location: suburbLocation('Observatory'),
    ...overrides,
  };
}

const OFFER: OfferNeeds = { coldChain: 'refrigerated', offeredQuantityKg: 30 };

function eligible(profile: RecipientProfile, offer = OFFER) {
  return isEligible(profile, offer, DONOR, DEFAULT_RADIUS_KM);
}

describe('status', () => {
  const expected: Record<OrganisationStatus, boolean> = {
    pending: false,
    verified: true,
    rejected: false,
    active: true,
    suspended: false,
  };

  test.each(OrganisationStatus.options)('a %s recipient', (status) => {
    expect(eligible(recipient({ status }))).toBe(expected[status]);
  });

  test('a donor organisation is never a recipient', () => {
    expect(eligible(recipient({ type: 'donor', status: 'active' }))).toBe(false);
  });
});

describe('storage against the cold chain', () => {
  const cases = [
    { coldChain: 'ambient', field: 'storageAmbient' },
    { coldChain: 'refrigerated', field: 'storageRefrigerated' },
    { coldChain: 'frozen', field: 'storageFrozen' },
  ] as const;

  test.each(cases)('$coldChain food needs $field and nothing else', ({ coldChain, field }) => {
    const offer = { coldChain, offeredQuantityKg: 30 };
    const only = recipient({
      storageAmbient: false,
      storageRefrigerated: false,
      storageFrozen: false,
      [field]: true,
    });
    const without = recipient({ [field]: false });

    expect(eligible(only, offer)).toBe(true);
    expect(eligible(without, offer)).toBe(false);
  });

  test('missing storage fields count as no storage', () => {
    expect(eligible(recipient({ storageRefrigerated: undefined }))).toBe(false);
    expect(eligible(recipient({ storageRefrigerated: null }))).toBe(false);
  });
});

describe('capacity', () => {
  test('no limit, a larger limit and an equal limit all take the offer', () => {
    expect(eligible(recipient({ maxCapacityKg: null }))).toBe(true);
    expect(eligible(recipient({ maxCapacityKg: undefined }))).toBe(true);
    expect(eligible(recipient({ maxCapacityKg: 31 }))).toBe(true);
    expect(eligible(recipient({ maxCapacityKg: 30 }))).toBe(true);
  });

  test('a smaller limit does not', () => {
    expect(eligible(recipient({ maxCapacityKg: 29.9 }))).toBe(false);
  });
});

describe('distance', () => {
  test('a recipient inside the radius is eligible and one outside is not', () => {
    expect(distanceKm(DONOR, suburbLocation('Observatory').coordinates)).toBeLessThan(15);
    expect(distanceKm(DONOR, suburbLocation('Khayelitsha').coordinates)).toBeGreaterThan(15);

    expect(eligible(recipient({ location: suburbLocation('Khayelitsha') }))).toBe(false);
  });

  test('the radius is a setting', () => {
    const far = recipient({ location: suburbLocation('Khayelitsha') });

    expect(isEligible(far, OFFER, DONOR, 40)).toBe(true);
    expect(isEligible(recipient(), OFFER, DONOR, 1)).toBe(false);
  });

  test('one degree of latitude is about 111 km', () => {
    expect(distanceKm([18, -34], [18, -33])).toBeCloseTo(111.3, 1);
    expect(distanceKm(DONOR, DONOR)).toBe(0);
  });
});

describe('transport', () => {
  test('never changes the result', () => {
    const withVehicle = { ...recipient(), hasTransport: true };
    const without = { ...recipient(), hasTransport: false };

    expect(eligible(withVehicle)).toBe(true);
    expect(eligible(without)).toBe(true);
  });
});

describe('query filters', () => {
  test('the recipients filter holds the same rules', () => {
    const filter = eligibleRecipientsFilter(OFFER, DONOR, DEFAULT_RADIUS_KM);

    expect(filter).toEqual({
      type: 'recipient',
      status: { $in: ['verified', 'active'] },
      storageRefrigerated: true,
      $or: [{ maxCapacityKg: null }, { maxCapacityKg: { $gte: 30 } }],
      location: { $geoWithin: { $centerSphere: [DONOR, DEFAULT_RADIUS_KM / 6378.1] } },
    });
    expect(JSON.stringify(filter)).not.toContain('Transport');
  });

  test('the offers filter for one recipient follows its storage and capacity', () => {
    const fridgeOnly = recipient({
      storageAmbient: false,
      storageFrozen: false,
      maxCapacityKg: 40,
    });

    expect(offersForRecipientFilter(fridgeOnly)).toEqual({
      coldChain: { $in: ['refrigerated'] },
      offeredQuantityKg: { $lte: 40 },
    });
    expect(offersForRecipientFilter(recipient())).toEqual({
      coldChain: { $in: ['ambient', 'refrigerated', 'frozen'] },
    });
  });

  test('a recipient with no storage at all matches no offer', () => {
    const none = recipient({
      storageAmbient: false,
      storageRefrigerated: false,
      storageFrozen: false,
    });

    expect(offersForRecipientFilter(none).coldChain).toEqual({ $in: [] });
  });

  test('the donors near a recipient are found within the same radius', () => {
    const location = suburbLocation('Observatory').coordinates;

    expect(nearbyDonorsFilter(location, 15)).toEqual({
      type: 'donor',
      location: { $geoWithin: { $centerSphere: [location, 15 / 6378.1] } },
    });
  });
});
