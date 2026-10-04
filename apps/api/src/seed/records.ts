import { createHash } from 'node:crypto';
import {
  FoodCategory,
  SUBURBS,
  suburbLocation,
  type AuditAction,
  type ColdChain,
  type Condition,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { SA_OFFSET } from '../services/day-range.js';
import { isEligible } from '../services/eligibility.js';
import { REFERENCE_ALPHABET, REFERENCE_LENGTH } from '../services/offer-reference.js';
import { CONSENT_VERSION } from '../services/user-service.js';
import {
  COLD_CHAIN,
  DONORS,
  DRIVERS,
  MARIUS,
  NADIA,
  PLACEHOLDER_RATES,
  RECIPIENTS,
  RELEASE_REASONS,
  TITLES,
  ZANELE,
  type DonorSeed,
  type Person,
  type RecipientSeed,
} from './scenario.js';

/** timestamps are set here rather than by Mongoose, to keep the history's own dates */
export interface SeedDoc {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  [field: string]: unknown;
}

/** keyed by collection name */
export interface SeedRecords {
  organisations: SeedDoc[];
  users: SeedDoc[];
  valuationRates: SeedDoc[];
  offers: SeedDoc[];
  claims: SeedDoc[];
  collections: SeedDoc[];
  handoverRecords: SeedDoc[];
  auditLogs: SeedDoc[];
}

/** the six weeks run from this many days ago up to today */
export const HISTORY_DAYS = 41;

/** reaches Khayelitsha from the city bowl donors. set MATCH_RADIUS_KM to match */
export const SEED_RADIUS_KM = 30;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** a calendar day in South African time, as `YYYY-MM-DD` */
export function saDay(now: Date, daysAgo: number) {
  return new Date(now.getTime() - daysAgo * DAY).toLocaleDateString('en-CA', {
    timeZone: 'Africa/Johannesburg',
  });
}

export function seedPeriod(now: Date) {
  return { from: saDay(now, HISTORY_DAYS), to: saDay(now, 0) };
}

function atMinute(day: string, minutes: number) {
  return new Date(Date.parse(`${day}T00:00:00${SA_OFFSET}`) + minutes * MINUTE);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * MINUTE);
}

/** the last 16 hex digits name the record, and the first 8 are its creation time so id order is time order */
export function seedId(key: string, createdAt: Date) {
  const seconds = Math.floor(createdAt.getTime() / 1000)
    .toString(16)
    .padStart(8, '0');
  return new Types.ObjectId(seconds + seedSuffix(key));
}

export function seedSuffix(key: string) {
  return createHash('sha256').update(`fedsa-seed:${key}`).digest('hex').slice(0, 16);
}

/** the prototype's seeded generator. every run draws the same history */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OfferPlan {
  key: string;
  donor: DonorSeed;
  category: FoodCategory;
  kg: number;
  title: string;
  description?: string;
  postedAt: Date;
  availableFrom?: Date;
  deadline: Date;
  parent?: SeedDoc;
}

/**
 * the history depends only on the generator and the calendar, and the live
 * offers on `now`. two runs in the same minute give the same documents
 */
export function buildRecords(now: Date, passwordHash: string): SeedRecords {
  const rand = mulberry32(207600);
  const chooser = mulberry32(20261004);
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

  const records: SeedRecords = {
    organisations: [],
    users: [],
    valuationRates: [],
    offers: [],
    claims: [],
    collections: [],
    handoverRecords: [],
    auditLogs: [],
  };
  const orgIds = new Map<string, Types.ObjectId>();
  const userIds = new Map<string, Types.ObjectId>();
  const usedReferences = new Set<string>();

  const ago = (minutes: number) => addMinutes(now, -minutes);
  const daysAgoAt = (daysAgo: number, hour: number, minute = 0) =>
    atMinute(saDay(now, daysAgo), hour * 60 + minute);

  function addUser(person: Person, organisationId: Types.ObjectId | null, createdAt: Date) {
    const doc: SeedDoc = {
      _id: seedId(`user:${person.key}`, createdAt),
      organisationId,
      role: person.role,
      fullName: person.fullName,
      email: person.email,
      passwordHash,
      phone: person.phone,
      languagePreference: person.languagePreference,
      status: person.status ?? 'active',
      lastLoginAt: null,
      mustChangePassword: false,
      consentedAt: createdAt,
      consentVersion: CONSENT_VERSION,
      pushSubscriptions: [],
      createdAt,
      updatedAt: createdAt,
    };
    records.users.push(doc);
    userIds.set(person.key, doc._id);
    return doc;
  }

  function audit(
    key: string,
    userKey: string,
    action: AuditAction,
    target: SeedDoc,
    type: string,
    at: Date,
    note: string | null = null,
  ) {
    records.auditLogs.push({
      _id: seedId(`audit:${key}`, at),
      userId: userIds.get(userKey),
      action,
      targetType: type,
      targetId: target._id,
      note,
      at,
      createdAt: at,
      updatedAt: at,
    });
  }

  function organisationBase(seed: DonorSeed | RecipientSeed, createdAt: Date) {
    return {
      _id: seedId(`organisation:${seed.key}`, createdAt),
      name: seed.name,
      type: seed.type,
      addressLine: seed.addressLine,
      suburb: seed.suburb,
      city: SUBURBS.find((s) => s.name === seed.suburb)!.city,
      location: suburbLocation(seed.suburb),
      contactName: seed.person.fullName,
      contactPhone: seed.person.phone,
      contactEmail: seed.person.email,
      capacityNotes: seed.capacityNotes,
      taxReferenceNumber: null,
      createdAt,
    };
  }

  const staffJoined = daysAgoAt(52, 9);
  addUser(NADIA, null, staffJoined);
  addUser(ZANELE, null, staffJoined);
  const marius = addUser(MARIUS, null, staffJoined);
  const mariusDisabled = daysAgoAt(30, 12);
  marius.updatedAt = mariusDisabled;
  audit(
    'disable-marius',
    ZANELE.key,
    'disable_user',
    marius,
    'users',
    mariusDisabled,
    'Left FEDSA at the end of the contract period.',
  );

  for (const category of FoodCategory.options) {
    const at = daysAgoAt(52, 9, 30);
    records.valuationRates.push({
      _id: seedId(`rate:${category}`, at),
      category,
      ratePerKg: PLACEHOLDER_RATES[category],
      updatedByUserId: null,
      createdAt: at,
      updatedAt: at,
    });
  }

  DONORS.forEach((donor, index) => {
    const joined = daysAgoAt(44 + index, 10);
    const doc: SeedDoc = {
      ...organisationBase(donor, joined),
      status: 'active',
      verifiedAt: null,
      verifiedByUserId: null,
      updatedAt: joined,
    };
    records.organisations.push(doc);
    orgIds.set(donor.key, doc._id);
    addUser(donor.person, doc._id, joined);
  });

  RECIPIENTS.forEach((recipient, index) => {
    const pending = recipient.status === 'pending';
    const joined = pending ? daysAgoAt(6, 11, 20) : daysAgoAt(46 + index, 11);
    const verifiedAt = pending ? null : addMinutes(joined, 2 * 24 * 60 + 180);
    const doc: SeedDoc = {
      ...organisationBase(recipient, joined),
      status: recipient.status,
      verifiedAt,
      verifiedByUserId: pending ? null : userIds.get(NADIA.key),
      storageAmbient: recipient.storageAmbient,
      storageRefrigerated: recipient.storageRefrigerated,
      storageFrozen: recipient.storageFrozen,
      maxCapacityKg: recipient.maxCapacityKg,
      hasTransport: recipient.hasTransport,
      mealsPerDay: recipient.mealsPerDay,
      updatedAt: verifiedAt ?? joined,
    };
    records.organisations.push(doc);
    orgIds.set(recipient.key, doc._id);
    addUser(recipient.person, doc._id, joined);
    if (verifiedAt) {
      audit(
        `verify-${recipient.key}`,
        NADIA.key,
        'verify_organisation',
        doc,
        'organisations',
        verifiedAt,
        'Site visit completed, food handling checked, approved for claiming.',
      );
    }
  });

  function newReference() {
    let reference = '';
    while (reference === '' || usedReferences.has(reference)) {
      reference = '';
      for (let i = 0; i < REFERENCE_LENGTH; i += 1) reference += pick([...REFERENCE_ALPHABET]);
    }
    usedReferences.add(reference);
    return reference;
  }

  const donorOf = new Map<SeedDoc, DonorSeed>();

  function addOffer(plan: OfferPlan) {
    const doc: SeedDoc = {
      _id: seedId(`offer:${plan.key}`, plan.postedAt),
      donorOrganisationId: orgIds.get(plan.donor.key),
      postedByUserId: userIds.get(plan.donor.person.key),
      reference: newReference(),
      title: plan.title,
      description: plan.description ?? plan.parent?.description ?? null,
      category: plan.category,
      offeredQuantityKg: plan.kg,
      coldChain: COLD_CHAIN[plan.category],
      photoUrls: [],
      availableFrom: plan.availableFrom ?? plan.postedAt,
      collectionDeadline: plan.deadline,
      status: 'open',
      expiredAt: null,
      parentOfferId: plan.parent?._id ?? null,
      createdAt: plan.postedAt,
      updatedAt: plan.postedAt,
    };
    records.offers.push(doc);
    donorOf.set(doc, plan.donor);
    return doc;
  }

  function setStatus(doc: SeedDoc, status: string, at: Date) {
    doc.status = status;
    doc.updatedAt = at;
  }

  function addClaim(key: string, offer: SeedDoc, recipient: RecipientSeed, claimedAt: Date) {
    const doc: SeedDoc = {
      _id: seedId(`claim:${key}`, claimedAt),
      offerId: offer._id,
      recipientOrganisationId: orgIds.get(recipient.key),
      claimedByUserId: userIds.get(recipient.person.key),
      claimedAt,
      transportNeeded: !recipient.hasTransport,
      status: 'active',
      releasedAt: null,
      releaseReason: null,
      createdAt: claimedAt,
      updatedAt: claimedAt,
    };
    records.claims.push(doc);
    setStatus(offer, 'claimed', claimedAt);
    return doc;
  }

  function release(claim: SeedDoc, offer: SeedDoc, at: Date, reason: string) {
    setStatus(claim, 'released', at);
    claim.releasedAt = at;
    claim.releaseReason = reason;
    setStatus(offer, 'open', at);
  }

  function dispatch(
    key: string,
    claim: SeedDoc,
    at: Date,
    driver: { name: string; phone: string },
  ) {
    const doc: SeedDoc = {
      _id: seedId(`collection:${key}`, at),
      claimId: claim._id,
      dispatchedByUserId: userIds.get(NADIA.key),
      driverName: driver.name,
      driverPhone: driver.phone,
      dispatchedAt: at,
      scheduledFor: null,
      status: 'dispatched',
      createdAt: at,
      updatedAt: at,
    };
    records.collections.push(doc);
    audit(`dispatch-${key}`, NADIA.key, 'dispatch_driver', doc, 'collections', at);
    return doc;
  }

  /** the expiry job runs every five minutes, which puts expiry a little after the deadline */
  function expire(
    offer: SeedDoc,
    claim: SeedDoc | null,
    collection: SeedDoc | null,
    lateMinutes: number,
  ) {
    const at = addMinutes(offer.collectionDeadline as Date, lateMinutes);
    setStatus(offer, 'expired', at);
    offer.expiredAt = at;
    if (claim) setStatus(claim, 'expired', at);
    if (collection) setStatus(collection, 'cancelled', at);
  }

  function confirmByDonor(key: string, offer: SeedDoc, claim: SeedDoc, at: Date, kg: number) {
    const retainUntil = new Date(at);
    retainUntil.setUTCMonth(retainUntil.getUTCMonth() + 24);
    const doc: SeedDoc = {
      _id: seedId(`handover:${key}`, at),
      claimId: claim._id,
      offerId: offer._id,
      donorConfirmedByUserId: offer.postedByUserId,
      donorConfirmedAt: at,
      donorPhotoUrl: null,
      collectedQuantityKg: kg,
      recipientConfirmedByUserId: null,
      recipientConfirmedAt: null,
      conditionOnReceipt: null,
      conditionNotes: null,
      retainUntil,
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionNote: null,
      createdAt: at,
      updatedAt: at,
    };
    records.handoverRecords.push(doc);
    return doc;
  }

  function confirmByRecipient(
    handover: SeedDoc,
    offer: SeedDoc,
    claim: SeedDoc,
    at: Date,
    condition: Condition,
    notes: string | null = null,
  ) {
    handover.recipientConfirmedByUserId = claim.claimedByUserId;
    handover.recipientConfirmedAt = at;
    handover.conditionOnReceipt = condition;
    handover.conditionNotes = notes;
    handover.updatedAt = at;
    setStatus(offer, 'collected', at);
    setStatus(claim, 'fulfilled', at);
  }

  function recipientProfile(recipient: RecipientSeed) {
    return {
      type: recipient.type,
      status: recipient.status,
      storageAmbient: recipient.storageAmbient,
      storageRefrigerated: recipient.storageRefrigerated,
      storageFrozen: recipient.storageFrozen,
      maxCapacityKg: recipient.maxCapacityKg,
      location: suburbLocation(recipient.suburb),
    };
  }

  /** the API's own matching rule. no recipient takes food it could not have been offered */
  function eligibleFor(offer: SeedDoc, except?: RecipientSeed) {
    const donorLocation = suburbLocation(donorOf.get(offer)!.suburb).coordinates;
    const needs = {
      coldChain: offer.coldChain as ColdChain,
      offeredQuantityKg: offer.offeredQuantityKg as number,
    };
    return RECIPIENTS.filter(
      (r) => r !== except && isEligible(recipientProfile(r), needs, donorLocation, SEED_RADIUS_KM),
    );
  }

  /** a time the given fraction of the way through the offer's window, to the minute */
  function partWay(offer: SeedDoc, fraction: number) {
    const start = (offer.availableFrom as Date).getTime();
    const end = (offer.collectionDeadline as Date).getTime();
    return addMinutes(new Date(start), Math.round(((end - start) * fraction) / MINUTE));
  }

  /**
   * every offer draws the same numbers whichever way it goes, and recipients come
   * from their own generator. a recipient's details never change any outcome
   */
  function playOut(
    offer: SeedDoc,
    key: string,
    claimed: boolean,
    mayLeaveRemainder: boolean,
    except?: RecipientSeed,
  ) {
    const roll = {
      release: rand(),
      firstAt: rand(),
      releaseAt: rand(),
      reason: rand(),
      claimAt: rand(),
      expires: rand(),
      donorAt: rand(),
      short: rand(),
      shortBy: rand(),
      recipientAfter: rand(),
      condition: rand(),
      driver: rand(),
      late: rand(),
      remainderClaimed: rand(),
    };
    const choice = [chooser(), chooser()] as const;
    const scale = (value: number, lo: number, hi: number) => lo + value * (hi - lo);
    const from = <T>(items: T[], value: number): T => items[Math.floor(value * items.length)]!;
    const lateMinutes = Math.floor(roll.late * 5);
    const candidates = eligibleFor(offer, except);

    if (candidates.length === 0 || !claimed) {
      if (candidates.length > 0 && roll.release < 0.25) {
        const first = addClaim(
          `${key}-released`,
          offer,
          from(candidates, choice[0]),
          partWay(offer, scale(roll.firstAt, 0.05, 0.2)),
        );
        const releasedAt = partWay(offer, scale(roll.releaseAt, 0.25, 0.4));
        release(first, offer, releasedAt, from(RELEASE_REASONS, roll.reason));
      }
      expire(offer, null, null, lateMinutes);
      return;
    }

    let recipient = from(candidates, choice[0]);
    let claimedAt = partWay(offer, 0.03 + roll.claimAt ** 2 * 0.27);
    if (candidates.length > 1 && roll.release < 0.08) {
      const first = addClaim(
        `${key}-released`,
        offer,
        recipient,
        partWay(offer, scale(roll.firstAt, 0.03, 0.15)),
      );
      const releasedAt = partWay(offer, scale(roll.releaseAt, 0.18, 0.28));
      release(first, offer, releasedAt, from(RELEASE_REASONS, roll.reason));
      recipient = from(
        candidates.filter((r) => r !== recipient),
        choice[1],
      );
      claimedAt = partWay(offer, scale(roll.claimAt, 0.3, 0.4));
    }
    const claim = addClaim(key, offer, recipient, claimedAt);
    const driver = from(DRIVERS, roll.driver);

    if (roll.expires < 0.05) {
      const collection = claim.transportNeeded
        ? dispatch(key, claim, partWay(offer, 0.45), driver)
        : null;
      expire(offer, claim, collection, lateMinutes);
      return;
    }

    const donorAt = partWay(offer, scale(roll.donorAt, 0.55, 0.9));
    const collection = claim.transportNeeded
      ? dispatch(
          key,
          claim,
          addMinutes(claimedAt, Math.round((donorAt.getTime() - claimedAt.getTime()) / MINUTE / 2)),
          driver,
        )
      : null;
    const offeredKg = offer.offeredQuantityKg as number;
    const short = mayLeaveRemainder && roll.short < 0.12;
    const collectedKg = short
      ? Math.max(1, Math.round(offeredKg * scale(roll.shortBy, 0.6, 0.9)))
      : offeredKg;
    const handover = confirmByDonor(key, offer, claim, donorAt, collectedKg);

    let remainder: SeedDoc | null = null;
    if (collectedKg < offeredKg) {
      remainder = addOffer({
        key: `${key}-remainder`,
        donor: donorOf.get(offer)!,
        category: offer.category as FoodCategory,
        kg: offeredKg - collectedKg,
        title: offer.title as string,
        postedAt: donorAt,
        deadline: offer.collectionDeadline as Date,
        parent: offer,
      });
    }

    const recipientAt = addMinutes(donorAt, Math.floor(scale(roll.recipientAfter, 10, 61)));
    const condition = roll.condition < 0.08 ? 'acceptable' : 'good';
    confirmByRecipient(handover, offer, claim, recipientAt, condition);
    if (collection) setStatus(collection, 'completed', recipientAt);

    if (remainder) {
      const minutesLeft =
        ((offer.collectionDeadline as Date).getTime() - donorAt.getTime()) / MINUTE;
      const remainderClaimed = minutesLeft >= 45 && roll.remainderClaimed < 0.6;
      playOut(remainder, `${key}-remainder`, remainderClaimed, false, recipient);
    }
  }

  let count = 0;
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo -= 1) {
    const day = saDay(now, daysAgo);
    const offersToday = intBetween(2, 4);
    for (let i = 0; i < offersToday; i += 1) {
      count += 1;
      const donor = pick(DONORS);
      const category = pick(donor.habits.categories);
      const postedAt = atMinute(day, intBetween(...donor.habits.postsBetween));
      const offer = addOffer({
        key: `history-${count}`,
        donor,
        category,
        kg: intBetween(...donor.habits.kg),
        title: pick(TITLES[category]),
        postedAt,
        deadline: addMinutes(postedAt, intBetween(...donor.habits.windowMinutes)),
      });
      const roll = rand();
      if (roll < 0.03) setStatus(offer, 'cancelled', partWay(offer, 0.2));
      else playOut(offer, `history-${count}`, roll >= 0.2, true);
    }
  }

  const donorSeed = (key: string) => DONORS.find((d) => d.key === key)!;
  const recipientSeed = (key: string) => RECIPIENTS.find((r) => r.key === key)!;

  {
    const offer = addOffer({
      key: 'dispute-quantity',
      donor: donorSeed('harbour'),
      category: 'prepared',
      kg: 62,
      title: 'Banqueting surplus, conference',
      description:
        'Chicken, rice and roast vegetables from a conference lunch. Portioned into trays.',
      postedAt: daysAgoAt(2, 12),
      deadline: daysAgoAt(2, 14),
    });
    const claim = addClaim(
      'dispute-quantity',
      offer,
      recipientSeed('ubuntu'),
      daysAgoAt(2, 12, 20),
    );
    const handover = confirmByDonor('dispute-quantity', offer, claim, daysAgoAt(2, 13, 40), 62);
    confirmByRecipient(
      handover,
      offer,
      claim,
      daysAgoAt(2, 15),
      'problem',
      'Only four trays arrived, about 40 kg. We were told there would be six.',
    );
  }
  {
    const offer = addOffer({
      key: 'dispute-condition',
      donor: donorSeed('fruit'),
      category: 'produce',
      kg: 38,
      title: 'Tomatoes and leafy greens',
      description: 'Two crates of tomatoes, spinach and lettuce.',
      postedAt: daysAgoAt(1, 9),
      deadline: daysAgoAt(1, 12),
    });
    const claim = addClaim('dispute-condition', offer, recipientSeed('athlone'), daysAgoAt(1, 10));
    const collection = dispatch('dispute-condition', claim, daysAgoAt(1, 10, 30), DRIVERS[0]!);
    const handover = confirmByDonor('dispute-condition', offer, claim, daysAgoAt(1, 11), 38);
    confirmByRecipient(
      handover,
      offer,
      claim,
      daysAgoAt(1, 13),
      'problem',
      'The tomatoes at the bottom of both crates were already going. We could use maybe half.',
    );
    setStatus(collection, 'completed', daysAgoAt(1, 13));
  }
  {
    const offer = addOffer({
      key: 'missed-collection',
      donor: donorSeed('bokaap'),
      category: 'bakery',
      kg: 24,
      title: 'Pastries and day-old bread',
      description: 'Croissants, koeksisters and eight loaves.',
      postedAt: daysAgoAt(3, 15),
      deadline: daysAgoAt(3, 17),
    });
    const claim = addClaim('missed-collection', offer, recipientSeed('masi'), daysAgoAt(3, 15, 30));
    const collection = dispatch('missed-collection', claim, daysAgoAt(3, 16), DRIVERS[1]!);
    expire(offer, claim, collection, 2);
  }

  addOffer({
    key: 'live-dairy',
    donor: donorSeed('kaap'),
    category: 'dairy',
    kg: 45,
    title: 'Chilled dairy, short date',
    description:
      'Yoghurt and milk flagged at this morning stock check. Must stay chilled the whole way. Loading bay at the back of the store.',
    postedAt: ago(180),
    deadline: ago(-300),
  });
  addOffer({
    key: 'live-produce',
    donor: donorSeed('fruit'),
    category: 'produce',
    kg: 140,
    title: 'Mixed produce, full pallet',
    description:
      'Butternut, cabbage, onions and potatoes. Everything is sound, it just will not hold another week on the shelf. Bring at least two people.',
    postedAt: ago(60),
    deadline: ago(-240),
  });
  addOffer({
    key: 'live-prepared',
    donor: donorSeed('deli'),
    category: 'prepared',
    kg: 18,
    title: 'Prepared meals, lunch service',
    description:
      "Lasagne and vegetable curry from today's lunch service, portioned and covered. Two hours, no longer.",
    postedAt: ago(25),
    deadline: ago(-95),
  });
  addOffer({
    key: 'live-scheduled',
    donor: donorSeed('kaap'),
    category: 'dry',
    kg: 95,
    title: 'Bread and dry goods, tomorrow',
    description:
      "Tomorrow's stock rotation, confirmed with the store manager. Rice, pasta, tinned goods and in-store bakery bread. Collection any time between 09:00 and 17:00.",
    postedAt: ago(120),
    availableFrom: atMinute(saDay(now, -1), 9 * 60),
    deadline: atMinute(saDay(now, -1), 17 * 60),
  });
  {
    const offer = addOffer({
      key: 'live-needs-driver',
      donor: donorSeed('bokaap'),
      category: 'bakery',
      kg: 21,
      title: 'Bread, 30 loaves',
      description: "Yesterday's bake, still good. Collect from the front counter.",
      postedAt: ago(120),
      deadline: ago(-180),
    });
    addClaim('live-needs-driver', offer, recipientSeed('siyakhula'), ago(95));
  }
  {
    const offer = addOffer({
      key: 'live-awaiting-recipient',
      donor: donorSeed('harbour'),
      category: 'prepared',
      kg: 27,
      title: 'Function surplus, cold platters',
      description: 'Sandwich platters and salads from a morning function.',
      postedAt: ago(240),
      deadline: ago(-120),
    });
    const claim = addClaim('live-awaiting-recipient', offer, recipientSeed('stmichaels'), ago(190));
    confirmByDonor('live-awaiting-recipient', offer, claim, ago(50), 27);
  }

  return records;
}
