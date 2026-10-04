import { describe, expect, test } from 'vitest';
import {
  CreateUserRequest,
  ERROR_STATUS,
  ErrorCode,
  ListHandoversQuery,
  PostOfferFields,
  RecipientConfirmRequest,
  RegisterRequest,
  ROUTES,
  routeKey,
  Suburb,
  suburbLocation,
} from './index.js';

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('routes', () => {
  test('each method and path appears once', () => {
    const keys = ROUTES.map(routeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every path is under /api', () => {
    for (const r of ROUTES) expect(r.path.startsWith('/api/')).toBe(true);
  });
});

test('every error code has a status', () => {
  for (const code of ErrorCode.options) expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
});

describe('PostOfferFields', () => {
  const valid = {
    title: '62 loaves and 40 rolls',
    category: 'bakery',
    offeredQuantityKg: '31',
    coldChain: 'ambient',
    collectionDeadline: inHours(2),
  };

  test('coerces the multipart quantity', () => {
    expect(PostOfferFields.parse(valid).offeredQuantityKg).toBe(31);
  });

  test('rejects a deadline in the past', () => {
    const r = PostOfferFields.safeParse({ ...valid, collectionDeadline: inHours(-1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['collectionDeadline']);
  });

  test('rejects a deadline before the available time', () => {
    const r = PostOfferFields.safeParse({ ...valid, availableFrom: inHours(3) });
    expect(r.success).toBe(false);
  });

  test('rejects a zero quantity', () => {
    expect(PostOfferFields.safeParse({ ...valid, offeredQuantityKg: '0' }).success).toBe(false);
  });
});

test('a problem condition needs notes', () => {
  expect(RecipientConfirmRequest.safeParse({ conditionOnReceipt: 'problem' }).success).toBe(false);
  expect(
    RecipientConfirmRequest.safeParse({
      conditionOnReceipt: 'problem',
      conditionNotes: '4 kg short',
    }).success,
  ).toBe(true);
  expect(RecipientConfirmRequest.safeParse({ conditionOnReceipt: 'good' }).success).toBe(true);
});

test('the resolved query flag parses "false" as false', () => {
  expect(ListHandoversQuery.parse({ resolved: 'false' }).resolved).toBe(false);
});

describe('RegisterRequest', () => {
  const user = {
    fullName: 'Brother Peter',
    email: 'Peter@StMichaels.org.za',
    password: 'a long enough password',
    phone: '+27821234567',
    languagePreference: 'en',
  };
  const organisation = {
    name: "St Michael's Night Shelter",
    addressLine: '12 Main Road',
    suburb: 'Observatory',
    contactName: 'Brother Peter',
    contactPhone: '+27821234567',
    contactEmail: 'office@stmichaels.org.za',
    storageAmbient: true,
    storageRefrigerated: true,
    storageFrozen: false,
    hasTransport: true,
  };

  test('accepts a recipient and lowercases the email', () => {
    const r = RegisterRequest.parse({ role: 'recipient', organisation, user, consent: true });
    expect(r.user.email).toBe('peter@stmichaels.org.za');
  });

  test('requires consent', () => {
    expect(
      RegisterRequest.safeParse({ role: 'recipient', organisation, user, consent: false }).success,
    ).toBe(false);
  });

  test('rejects a local phone number', () => {
    const r = RegisterRequest.safeParse({
      role: 'recipient',
      organisation,
      user: { ...user, phone: '0821234567' },
      consent: true,
    });
    expect(r.success).toBe(false);
  });

  test('requires storage fields for a recipient', () => {
    const withoutStorage = { ...organisation, storageAmbient: undefined };
    expect(
      RegisterRequest.safeParse({
        role: 'recipient',
        organisation: withoutStorage,
        user,
        consent: true,
      }).success,
    ).toBe(false);
  });
});

test('staff accounts have no organisation and member accounts need one', () => {
  const base = {
    fullName: 'Zanele',
    email: 'z@fedsa.org.za',
    phone: '+27821234567',
    languagePreference: 'xh',
  };
  const orgId = 'a'.repeat(24);
  expect(CreateUserRequest.safeParse({ ...base, role: 'administrator' }).success).toBe(true);
  expect(
    CreateUserRequest.safeParse({ ...base, role: 'administrator', organisationId: orgId }).success,
  ).toBe(false);
  expect(CreateUserRequest.safeParse({ ...base, role: 'donor' }).success).toBe(false);
  expect(
    CreateUserRequest.safeParse({ ...base, role: 'donor', organisationId: orgId }).success,
  ).toBe(true);
});

test('every suburb maps to a point in the Cape Town metro', () => {
  for (const name of Suburb.options) {
    const [lng, lat] = suburbLocation(name).coordinates;
    expect(lat).toBeGreaterThan(-34.4);
    expect(lat).toBeLessThan(-33.6);
    expect(lng).toBeGreaterThan(18.2);
    expect(lng).toBeLessThan(19);
  }
});
