/* SEED DATA: HAND-BUILT SCENARIO + DETERMINISTIC GENERATED HISTORY */

import type {
  AppNotification,
  AppState,
  AuditEntry,
  Claim,
  Collection,
  Dispute,
  FoodCategory,
  HandoverRecord,
  Offer,
  Organisation,
  TaxCertificate,
  User,
} from './types';
import { KG_PER_MEAL } from '../lib/format';

/* TIME */

const NOW = new Date();

const minutes = (n: number) => n * 60_000;
const hours = (n: number) => n * 3_600_000;
const days = (n: number) => n * 86_400_000;

const iso = (ms: number) => new Date(ms).toISOString();
const fromNow = (ms: number) => iso(NOW.getTime() + ms);

/** DAY-OFFSET CLOCK TIME */
function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/* GENERATOR */

/** SEEDED PRNG FOR DETERMINISTIC OUTPUT */
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

const rand = mulberry32(20260817);

const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

/* ORGANISATIONS */

export const organisations: Organisation[] = [
  /* DONORS */
  {
    id: 'org-ouma',
    name: "Ouma's Bakery",
    kind: 'donor',
    suburb: 'Woodstock',
    distanceKm: 2.4,
    contactName: 'Riaan de Villiers',
    contactPhone: '+27821114402',
    verification: 'verified',
    capacityNotes:
      'Knows his surplus at 16:00 cash-up and locks up at 17:30. Will not fill in forms. Keep posting to three taps.',
    joinedAt: iso(NOW.getTime() - days(680)),
  },
  {
    id: 'org-kaap',
    name: 'Kaap Foods',
    kind: 'donor',
    suburb: 'Kenilworth',
    distanceKm: 9.1,
    contactName: 'Nomsa Sithole',
    contactPhone: '+27822227713',
    verification: 'verified',
    capacityNotes:
      'Near-expiry stock flagged at the morning stock check, so a 24-hour window rather than 90 minutes. Head office requires a paper trail and tax certificates for anything leaving the store.',
    joinedAt: iso(NOW.getTime() - days(540)),
  },
  {
    id: 'org-deli',
    name: 'Woodstock Deli & Bistro',
    kind: 'donor',
    suburb: 'Woodstock',
    distanceKm: 2.9,
    contactName: 'Shireen Adams',
    contactPhone: '+27823338821',
    verification: 'verified',
    capacityNotes: 'Prepared food only. Two-hour window from posting, never longer.',
    joinedAt: iso(NOW.getTime() - days(300)),
  },
  {
    id: 'org-fruit',
    name: 'Salt River Fruit Market',
    kind: 'donor',
    suburb: 'Salt River',
    distanceKm: 0.8,
    contactName: 'Yusuf Parker',
    contactPhone: '+27824449930',
    verification: 'verified',
    capacityNotes: 'Posts most mornings. High volume, short shelf life, always ambient.',
    joinedAt: iso(NOW.getTime() - days(420)),
  },
  {
    id: 'org-bokaap',
    name: 'Bo-Kaap Bakery',
    kind: 'donor',
    suburb: 'Bo-Kaap',
    distanceKm: 4.2,
    contactName: 'Faiza Ismail',
    contactPhone: '+27825551147',
    verification: 'verified',
    capacityNotes: 'Small but reliable. Bread and pastries, six days a week.',
    joinedAt: iso(NOW.getTime() - days(210)),
  },
  {
    id: 'org-harbour',
    name: 'Harbour View Hotel',
    kind: 'donor',
    suburb: 'Green Point',
    distanceKm: 6.7,
    contactName: 'Dean Cloete',
    contactPhone: '+27826662258',
    verification: 'verified',
    capacityNotes:
      'Banqueting surplus, irregular but large. Insists on a photographed handover record before releasing anything.',
    joinedAt: iso(NOW.getTime() - days(150)),
  },

  /* RECIPIENTS */
  {
    id: 'org-siyakhula',
    name: 'Siyakhula Shelter',
    kind: 'recipient',
    suburb: 'Khayelitsha',
    distanceKm: 26.4,
    contactName: 'Nosipho Dlamini',
    contactPhone: '+27737778812',
    capacityKg: 60,
    storage: ['ambient', 'frozen'],
    hasTransport: false,
    mealsPerDay: 120,
    verification: 'verified',
    capacityNotes:
      'One small chest freezer, no fridge, so nothing chilled. No vehicle at all - every collection needs a driver. Cooking starts at 15:30, which is exactly when the offers land. Phone is shared between three staff and she reads isiXhosa most comfortably.',
    joinedAt: iso(NOW.getTime() - days(610)),
  },
  {
    id: 'org-stmichaels',
    name: "St Michael's Night Shelter",
    kind: 'recipient',
    suburb: 'Observatory',
    distanceKm: 4.1,
    contactName: 'Peter Molefe',
    contactPhone: '+27731112204',
    capacityKg: 80,
    storage: ['ambient', 'refrigerated'],
    hasTransport: true,
    mealsPerDay: 90,
    verification: 'verified',
    capacityNotes:
      'Fridge, small van, desktop computer. Plans menus a week ahead and wants to know on Monday what he is cooking on Thursday. Best organisation in the network for anything scheduled.',
    joinedAt: iso(NOW.getTime() - days(590)),
  },
  {
    id: 'org-ubuntu',
    name: 'Ubuntu Soup Kitchen',
    kind: 'recipient',
    suburb: 'Langa',
    distanceKm: 12.8,
    contactName: 'Thandi Nkosi',
    contactPhone: '+27734446617',
    capacityKg: 200,
    storage: ['ambient', 'refrigerated', 'frozen'],
    hasTransport: true,
    mealsPerDay: 260,
    verification: 'verified',
    capacityNotes:
      'Largest recipient in the network. Cold room, chest freezers and a bakkie. The only organisation that can absorb a full supermarket produce run.',
    joinedAt: iso(NOW.getTime() - days(500)),
  },
  {
    id: 'org-masi',
    name: 'Masiphumelele Care Centre',
    kind: 'recipient',
    suburb: 'Masiphumelele',
    distanceKm: 32.1,
    contactName: 'Lindiwe Mabaso',
    contactPhone: '+27735558829',
    capacityKg: 45,
    storage: ['ambient'],
    hasTransport: false,
    mealsPerDay: 70,
    verification: 'verified',
    capacityNotes:
      'Dry storage only. Far out, so a driver is essential and the collection window has to allow an hour of travel.',
    joinedAt: iso(NOW.getTime() - days(340)),
  },
  {
    id: 'org-athlone',
    name: 'Athlone Haven',
    kind: 'recipient',
    suburb: 'Athlone',
    distanceKm: 11.3,
    contactName: 'Gadija Samaai',
    contactPhone: '+27736669940',
    capacityKg: 70,
    storage: ['ambient', 'refrigerated'],
    hasTransport: false,
    mealsPerDay: 85,
    verification: 'verified',
    capacityNotes: 'Fridge but no vehicle. Reliable on confirmations.',
    joinedAt: iso(NOW.getTime() - days(260)),
  },
  {
    id: 'org-mitchells',
    name: 'Mitchells Plain Feeding Scheme',
    kind: 'recipient',
    suburb: 'Mitchells Plain',
    distanceKm: 24.7,
    contactName: 'Riedwaan Jacobs',
    contactPhone: '+27737773351',
    capacityKg: 110,
    storage: ['ambient', 'frozen'],
    hasTransport: true,
    mealsPerDay: 150,
    verification: 'verified',
    capacityNotes: 'Own transport, two freezers. Takes bulk bakery well.',
    joinedAt: iso(NOW.getTime() - days(180)),
  },
  {
    id: 'org-hope',
    name: 'Hope Kitchen',
    kind: 'recipient',
    suburb: 'Delft',
    distanceKm: 21.9,
    contactName: 'Beauty Mokoena',
    contactPhone: '+27738884462',
    capacityKg: 50,
    storage: ['ambient'],
    hasTransport: false,
    mealsPerDay: 60,
    verification: 'pending',
    capacityNotes: '',
    joinedAt: iso(NOW.getTime() - days(6)),
  },
];

/* USERS */

export const users: User[] = [
  {
    id: 'usr-riaan',
    name: 'Riaan de Villiers',
    role: 'donor',
    organisationId: 'org-ouma',
    jobTitle: "Manager, Ouma's Bakery",
    language: 'en',
    active: true,
    personaNote: 'Knows his surplus at 16:00 and locks up at 17:30. Will not tolerate admin.',
  },
  {
    id: 'usr-nomsa',
    name: 'Nomsa Sithole',
    role: 'donor',
    organisationId: 'org-kaap',
    jobTitle: 'Fresh Produce Manager, Kaap Foods',
    language: 'en',
    active: true,
    personaNote: 'Plans a day ahead. Needs a paper trail and tax certificates for head office.',
  },
  {
    id: 'usr-nosipho',
    name: 'Nosipho Dlamini',
    role: 'recipient',
    organisationId: 'org-siyakhula',
    jobTitle: 'Coordinator, Siyakhula Shelter',
    language: 'xh',
    active: true,
    personaNote: 'Shared entry-level phone, no vehicle, one freezer. Reads isiXhosa most easily.',
  },
  {
    id: 'usr-peter',
    name: 'Peter Molefe',
    role: 'recipient',
    organisationId: 'org-stmichaels',
    jobTitle: "Manager, St Michael's Night Shelter",
    language: 'en',
    active: true,
    personaNote: 'Desktop, fridge, own van. Wants to plan the week, not react at 16:00.',
  },
  {
    id: 'usr-nadia',
    name: 'Nadia Petersen',
    role: 'coordinator',
    organisationId: null,
    jobTitle: 'Founder and Operations Coordinator, FEDSA',
    language: 'en',
    active: true,
    personaNote: 'Oversees every offer, verifies organisations and arranges transport.',
  },
  {
    id: 'usr-zanele',
    name: 'Zanele Booi',
    role: 'administrator',
    organisationId: null,
    jobTitle: 'Administrator and Reporting Assistant, FEDSA',
    language: 'en',
    active: true,
    personaNote: 'Produces the funder report. Three days of spreadsheet work, currently.',
  },
  /* EXTRA ACCOUNTS FOR MANAGE ACCOUNTS DEMO */
  {
    id: 'usr-thandi',
    name: 'Thandi Nkosi',
    role: 'recipient',
    organisationId: 'org-ubuntu',
    jobTitle: 'Kitchen Manager, Ubuntu Soup Kitchen',
    language: 'xh',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-shireen',
    name: 'Shireen Adams',
    role: 'donor',
    organisationId: 'org-deli',
    jobTitle: 'Owner, Woodstock Deli & Bistro',
    language: 'af',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-gadija',
    name: 'Gadija Samaai',
    role: 'recipient',
    organisationId: 'org-athlone',
    jobTitle: 'Manager, Athlone Haven',
    language: 'af',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-yusuf',
    name: 'Yusuf Parker',
    role: 'donor',
    organisationId: 'org-fruit',
    jobTitle: 'Owner, Salt River Fruit Market',
    language: 'en',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-beauty',
    name: 'Beauty Mokoena',
    role: 'recipient',
    organisationId: 'org-hope',
    jobTitle: 'Founder, Hope Kitchen',
    language: 'xh',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-marius',
    name: 'Marius Coetzee',
    role: 'coordinator',
    organisationId: null,
    jobTitle: 'Relief Coordinator, FEDSA',
    language: 'af',
    active: false,
    personaNote: '',
  },
  /* NOT LOGIN PERSONAS - SEPARATE ACCOUNTS TO AVOID MISATTRIBUTING OFFERS */
  {
    id: 'usr-faiza',
    name: 'Faiza Ismail',
    role: 'donor',
    organisationId: 'org-bokaap',
    jobTitle: 'Owner, Bo-Kaap Bakery',
    language: 'en',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-dean',
    name: 'Dean Cloete',
    role: 'donor',
    organisationId: 'org-harbour',
    jobTitle: 'Banqueting Manager, Harbour View Hotel',
    language: 'en',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-lindiwe',
    name: 'Lindiwe Mabaso',
    role: 'recipient',
    organisationId: 'org-masi',
    jobTitle: 'Coordinator, Masiphumelele Care Centre',
    language: 'xh',
    active: true,
    personaNote: '',
  },
  {
    id: 'usr-riedwaan',
    name: 'Riedwaan Jacobs',
    role: 'recipient',
    organisationId: 'org-mitchells',
    jobTitle: 'Manager, Mitchells Plain Feeding Scheme',
    language: 'af',
    active: true,
    personaNote: '',
  },
];

/** LOGIN PERSONAS, DEMO ORDER */
export const loginPersonaIds = [
  'usr-riaan',
  'usr-nomsa',
  'usr-nosipho',
  'usr-peter',
  'usr-nadia',
  'usr-zanele',
];

/** DRIVER CONTACTS, NOT ACCOUNTS */
export const driverContacts = [
  { name: 'Faried Salie', phone: '+27829994417', note: 'Contract driver, paid per collection' },
  { name: 'Sipho Ndlovu', phone: '+27713336628', note: 'Volunteer, weekday afternoons' },
  { name: 'Charmaine Botha', phone: '+27824447790', note: 'Volunteer, own bakkie' },
  { name: 'Ashwin Daniels', phone: '+27746662213', note: 'Volunteer, Mondays and Fridays' },
];

/* LIVE OFFERS */

const donorUserOf: Record<string, string> = {
  'org-ouma': 'usr-riaan',
  'org-kaap': 'usr-nomsa',
  'org-deli': 'usr-shireen',
  'org-fruit': 'usr-yusuf',
  'org-bokaap': 'usr-faiza',
  'org-harbour': 'usr-dean',
};

let offerCounter = 1000;
const nextOfferRef = () => `OF-${++offerCounter}`;

/* OF-1001 REBUILT INCIDENT; OF-1002 STORAGE FILTER; OF-1003 CAPACITY FILTER;
   OF-1004 SHORT WINDOW; OF-1005 SCHEDULED OFFER */
export const liveOffers: Offer[] = [
  {
    id: 'off-1001',
    reference: nextOfferRef(),
    donorOrganisationId: 'org-ouma',
    postedByUserId: 'usr-riaan',
    title: '62 loaves and 40 rolls',
    description:
      "End of day bake. All of it went out the oven this morning, still good tonight and tomorrow. Side door on Victoria Road, ask for Riaan.",
    category: 'bakery',
    offeredQuantityKg: 46,
    coldChain: 'ambient',
    photo: 'bread',
    availableFrom: fromNow(-minutes(12)),
    collectionDeadline: fromNow(minutes(78)),
    status: 'open',
    createdAt: fromNow(-minutes(12)),
    expiredAt: null,
    parentOfferId: null,
  },
  {
    id: 'off-1002',
    reference: nextOfferRef(),
    donorOrganisationId: 'org-kaap',
    postedByUserId: 'usr-nomsa',
    title: 'Chilled dairy, short date',
    description:
      'Yoghurt and milk flagged at this morning stock check. Must stay chilled the whole way. Loading bay at the back of the store.',
    category: 'dairy',
    offeredQuantityKg: 45,
    coldChain: 'refrigerated',
    photo: 'dairy',
    availableFrom: fromNow(-hours(3)),
    collectionDeadline: fromNow(hours(5)),
    status: 'open',
    createdAt: fromNow(-hours(3)),
    expiredAt: null,
    parentOfferId: null,
  },
  {
    id: 'off-1003',
    reference: nextOfferRef(),
    donorOrganisationId: 'org-fruit',
    postedByUserId: 'usr-yusuf',
    title: 'Mixed produce, full pallet',
    description:
      'Butternut, cabbage, onions and potatoes. Everything is sound, it just will not hold another week on the shelf. Bring at least two people.',
    category: 'produce',
    offeredQuantityKg: 140,
    coldChain: 'ambient',
    photo: 'produce',
    availableFrom: fromNow(-hours(1)),
    collectionDeadline: fromNow(hours(4)),
    status: 'open',
    createdAt: fromNow(-hours(1)),
    expiredAt: null,
    parentOfferId: null,
  },
  {
    id: 'off-1004',
    reference: nextOfferRef(),
    donorOrganisationId: 'org-deli',
    postedByUserId: 'usr-shireen',
    title: 'Prepared meals, lunch service',
    description:
      'Lasagne and vegetable curry from today lunch service, portioned and covered. Two hours, no longer.',
    category: 'prepared',
    offeredQuantityKg: 18,
    coldChain: 'refrigerated',
    photo: 'prepared',
    availableFrom: fromNow(-minutes(25)),
    collectionDeadline: fromNow(minutes(95)),
    status: 'open',
    createdAt: fromNow(-minutes(25)),
    expiredAt: null,
    parentOfferId: null,
  },
  {
    id: 'off-1005',
    reference: nextOfferRef(),
    donorOrganisationId: 'org-kaap',
    postedByUserId: 'usr-nomsa',
    title: 'Bread and dry goods, tomorrow',
    description:
      'Tomorrow stock rotation, confirmed with the store manager. Rice, pasta, tinned goods and in-store bakery bread. Collection any time between 09:00 and 17:00.',
    category: 'dry',
    offeredQuantityKg: 95,
    coldChain: 'ambient',
    photo: 'dry',
    availableFrom: at(1, 9, 0),
    collectionDeadline: at(1, 17, 0),
    status: 'open',
    createdAt: fromNow(-hours(2)),
    expiredAt: null,
    parentOfferId: null,
  },
];

/* DISPUTES, HAND-BUILT */

/* 3 HAND-BUILT DISPUTES, ONE PER TYPE, WITH CONTRADICTING RECORDS */
const disputeOffers: Offer[] = [
  {
    id: 'off-0901',
    reference: 'OF-0901',
    donorOrganisationId: 'org-harbour',
    postedByUserId: 'usr-dean',
    title: 'Banqueting surplus, conference',
    description: 'Chicken, rice and roast vegetables from a conference lunch. Portioned into trays.',
    category: 'prepared',
    offeredQuantityKg: 62,
    coldChain: 'refrigerated',
    photo: 'prepared',
    availableFrom: iso(NOW.getTime() - days(2) - hours(6)),
    collectionDeadline: iso(NOW.getTime() - days(2) - hours(4)),
    status: 'collected',
    createdAt: iso(NOW.getTime() - days(2) - hours(6)),
    expiredAt: null,
    parentOfferId: null,
  },
  {
    id: 'off-0902',
    reference: 'OF-0902',
    donorOrganisationId: 'org-bokaap',
    postedByUserId: 'usr-faiza',
    title: 'Pastries and day-old bread',
    description: 'Croissants, koeksisters and eight loaves.',
    category: 'bakery',
    offeredQuantityKg: 24,
    coldChain: 'ambient',
    photo: 'bread',
    availableFrom: iso(NOW.getTime() - days(3) - hours(5)),
    collectionDeadline: iso(NOW.getTime() - days(3) - hours(3)),
    status: 'expired',
    createdAt: iso(NOW.getTime() - days(3) - hours(5)),
    expiredAt: iso(NOW.getTime() - days(3) - hours(3)),
    parentOfferId: null,
  },
  {
    id: 'off-0903',
    reference: 'OF-0903',
    donorOrganisationId: 'org-fruit',
    postedByUserId: 'usr-yusuf',
    title: 'Tomatoes and leafy greens',
    description: 'Two crates of tomatoes, spinach and lettuce.',
    category: 'produce',
    offeredQuantityKg: 38,
    coldChain: 'ambient',
    photo: 'produce',
    availableFrom: iso(NOW.getTime() - days(1) - hours(7)),
    collectionDeadline: iso(NOW.getTime() - days(1) - hours(4)),
    status: 'collected',
    createdAt: iso(NOW.getTime() - days(1) - hours(7)),
    expiredAt: null,
    parentOfferId: null,
  },
];

const disputeClaims: Claim[] = [
  {
    id: 'clm-0901',
    offerId: 'off-0901',
    recipientOrganisationId: 'org-ubuntu',
    claimedByUserId: 'usr-thandi',
    needsTransport: false,
    claimedAt: iso(NOW.getTime() - days(2) - hours(5) - minutes(40)),
    releasedAt: null,
    releaseReason: null,
  },
  {
    id: 'clm-0902',
    offerId: 'off-0902',
    recipientOrganisationId: 'org-masi',
    claimedByUserId: 'usr-lindiwe',
    needsTransport: true,
    claimedAt: iso(NOW.getTime() - days(3) - hours(4) - minutes(30)),
    releasedAt: null,
    releaseReason: null,
  },
  {
    id: 'clm-0903',
    offerId: 'off-0903',
    recipientOrganisationId: 'org-athlone',
    claimedByUserId: 'usr-gadija',
    needsTransport: true,
    claimedAt: iso(NOW.getTime() - days(1) - hours(6)),
    releasedAt: null,
    releaseReason: null,
  },
];

const disputeHandovers: HandoverRecord[] = [
  /* QUANTITY MISMATCH: DONOR 62KG VS RECIPIENT 40KG */
  {
    id: 'hnd-0901',
    claimId: 'clm-0901',
    donorConfirmedAt: iso(NOW.getTime() - days(2) - hours(4) - minutes(20)),
    donorConfirmedByUserId: 'usr-dean',
    donorQuantityKg: 62,
    donorPhoto: 'prepared',
    recipientConfirmedAt: iso(NOW.getTime() - days(2) - hours(3)),
    recipientConfirmedByUserId: 'usr-thandi',
    recipientQuantityKg: 40,
    recipientCondition: 'good',
    recipientNote: 'Only four trays arrived. We were told there would be six.',
  },
  /* NON-COLLECTION: NEVER CONFIRMED */
  {
    id: 'hnd-0902',
    claimId: 'clm-0902',
    donorConfirmedAt: null,
    donorConfirmedByUserId: null,
    donorQuantityKg: null,
    donorPhoto: null,
    recipientConfirmedAt: null,
    recipientConfirmedByUserId: null,
    recipientQuantityKg: null,
    recipientCondition: null,
    recipientNote: null,
  },
  /* CONDITION: RECIPIENT FLAGGED POOR */
  {
    id: 'hnd-0903',
    claimId: 'clm-0903',
    donorConfirmedAt: iso(NOW.getTime() - days(1) - hours(5)),
    donorConfirmedByUserId: 'usr-yusuf',
    donorQuantityKg: 38,
    donorPhoto: 'produce',
    recipientConfirmedAt: iso(NOW.getTime() - days(1) - hours(3)),
    recipientConfirmedByUserId: 'usr-gadija',
    recipientQuantityKg: 38,
    recipientCondition: 'poor',
    recipientNote:
      'The tomatoes at the bottom of both crates were already going. We could use maybe half.',
  },
];

const disputeCollections: Collection[] = [
  {
    id: 'col-0902',
    claimId: 'clm-0902',
    dispatchedByUserId: 'usr-nadia',
    driverName: 'Sipho Ndlovu',
    driverPhone: '+27713336628',
    dispatchedAt: iso(NOW.getTime() - days(3) - hours(4)),
    status: 'cancelled',
  },
  {
    id: 'col-0903',
    claimId: 'clm-0903',
    dispatchedByUserId: 'usr-nadia',
    driverName: 'Faried Salie',
    driverPhone: '+27829994417',
    dispatchedAt: iso(NOW.getTime() - days(1) - hours(5) - minutes(30)),
    status: 'completed',
  },
];

export const disputes: Dispute[] = [
  {
    id: 'dsp-001',
    reference: 'DP-014',
    claimId: 'clm-0901',
    type: 'handover-mismatch',
    openedAt: iso(NOW.getTime() - days(2) - hours(3)),
    status: 'open',
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
  },
  {
    id: 'dsp-002',
    reference: 'DP-015',
    claimId: 'clm-0902',
    type: 'non-collection',
    openedAt: iso(NOW.getTime() - days(3) - hours(3)),
    status: 'open',
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
  },
  {
    id: 'dsp-003',
    reference: 'DP-016',
    claimId: 'clm-0903',
    type: 'food-condition',
    openedAt: iso(NOW.getTime() - days(1) - hours(3)),
    status: 'open',
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
  },
];

/* IN FLIGHT */

/* 2 CLAIMED-NOT-COLLECTED OFFERS: ONE NEEDS A DRIVER, ONE DOESN'T */
const inFlightOffers: Offer[] = [
  {
    id: 'off-1006',
    reference: 'OF-0998',
    donorOrganisationId: 'org-bokaap',
    postedByUserId: 'usr-faiza',
    title: 'Bread, 30 loaves',
    description: 'Yesterday bake, still good. Collect from the front counter.',
    category: 'bakery',
    offeredQuantityKg: 21,
    coldChain: 'ambient',
    photo: 'bread',
    availableFrom: fromNow(-hours(2)),
    collectionDeadline: fromNow(hours(3)),
    status: 'claimed',
    createdAt: fromNow(-hours(2)),
    expiredAt: null,
    parentOfferId: null,
  },
  {
    id: 'off-1007',
    reference: 'OF-0999',
    donorOrganisationId: 'org-harbour',
    postedByUserId: 'usr-dean',
    title: 'Function surplus, cold platters',
    description: 'Sandwich platters and salads from a morning function.',
    category: 'prepared',
    offeredQuantityKg: 27,
    coldChain: 'refrigerated',
    photo: 'prepared',
    availableFrom: fromNow(-hours(4)),
    collectionDeadline: fromNow(hours(2)),
    status: 'claimed',
    createdAt: fromNow(-hours(4)),
    expiredAt: null,
    parentOfferId: null,
  },
];

const inFlightClaims: Claim[] = [
  {
    id: 'clm-1006',
    offerId: 'off-1006',
    recipientOrganisationId: 'org-siyakhula',
    claimedByUserId: 'usr-nosipho',
    needsTransport: true,
    claimedAt: fromNow(-hours(1) - minutes(35)),
    releasedAt: null,
    releaseReason: null,
  },
  {
    id: 'clm-1007',
    offerId: 'off-1007',
    recipientOrganisationId: 'org-stmichaels',
    claimedByUserId: 'usr-peter',
    needsTransport: false,
    claimedAt: fromNow(-hours(3) - minutes(10)),
    releasedAt: null,
    releaseReason: null,
  },
];

const inFlightHandovers: HandoverRecord[] = [
  {
    id: 'hnd-1006',
    claimId: 'clm-1006',
    donorConfirmedAt: null,
    donorConfirmedByUserId: null,
    donorQuantityKg: null,
    donorPhoto: null,
    recipientConfirmedAt: null,
    recipientConfirmedByUserId: null,
    recipientQuantityKg: null,
    recipientCondition: null,
    recipientNote: null,
  },
  /* DONOR CONFIRMED, RECIPIENT NOT - DELIBERATE PARTIAL STATE */
  {
    id: 'hnd-1007',
    claimId: 'clm-1007',
    donorConfirmedAt: fromNow(-minutes(50)),
    donorConfirmedByUserId: 'usr-dean',
    donorQuantityKg: 27,
    donorPhoto: 'prepared',
    recipientConfirmedAt: null,
    recipientConfirmedByUserId: null,
    recipientQuantityKg: null,
    recipientCondition: null,
    recipientNote: null,
  },
];

/* HISTORY */

const donorIds = ['org-ouma', 'org-kaap', 'org-deli', 'org-fruit', 'org-bokaap', 'org-harbour'];
const recipientIds = [
  'org-siyakhula',
  'org-stmichaels',
  'org-ubuntu',
  'org-masi',
  'org-athlone',
  'org-mitchells',
];

/** WEIGHTED: SUPERMARKET/FRUIT MARKET CARRY TONNAGE, BAKERIES CARRY COUNT */
const donorProfile: Record<string, { categories: FoodCategory[]; kg: [number, number] }> = {
  'org-ouma': { categories: ['bakery'], kg: [18, 62] },
  'org-kaap': { categories: ['produce', 'dairy', 'dry'], kg: [60, 240] },
  'org-deli': { categories: ['prepared'], kg: [8, 32] },
  'org-fruit': { categories: ['produce'], kg: [45, 190] },
  'org-bokaap': { categories: ['bakery'], kg: [12, 40] },
  'org-harbour': { categories: ['prepared', 'other'], kg: [25, 110] },
};

const coldChainFor: Record<FoodCategory, 'ambient' | 'refrigerated' | 'frozen'> = {
  bakery: 'ambient',
  produce: 'ambient',
  dairy: 'refrigerated',
  prepared: 'refrigerated',
  dry: 'ambient',
  other: 'ambient',
};

const photoFor: Record<FoodCategory, string> = {
  bakery: 'bread',
  produce: 'produce',
  dairy: 'dairy',
  prepared: 'prepared',
  dry: 'dry',
  other: 'mixed',
};

const historyTitles: Record<FoodCategory, string[]> = {
  bakery: ['Bread and rolls', 'End of day bake', 'Loaves and pastries', 'Day-old bread'],
  produce: ['Mixed vegetables', 'Fruit and veg', 'Butternut and cabbage', 'Salad vegetables'],
  dairy: ['Short-date dairy', 'Milk and yoghurt', 'Cheese and butter'],
  prepared: ['Prepared meals', 'Function surplus', 'Lunch service surplus'],
  dry: ['Dry goods', 'Rice, pasta and tins', 'Store cupboard stock'],
  other: ['Mixed grocery', 'Assorted surplus'],
};

interface History {
  offers: Offer[];
  claims: Claim[];
  collections: Collection[];
  handovers: HandoverRecord[];
}

/** 3 MONTHS HISTORY, ~1/3 EXPIRE UNCLAIMED (MATCHES CLIENT ESTIMATE) */
function generateHistory(): History {
  const offers: Offer[] = [];
  const claims: Claim[] = [];
  const collections: Collection[] = [];
  const handovers: HandoverRecord[] = [];

  let n = 0;
  /* DAY 92 -> 4; RECENT DAYS RESERVED FOR HAND-BUILT SCENARIO */
  for (let day = 92; day >= 4; day--) {
    const date = new Date(NOW.getTime() - days(day));
    const weekday = date.getDay();
    /* SUN QUIET, SAT HALF DAY */
    const count = weekday === 0 ? intBetween(0, 1) : weekday === 6 ? intBetween(1, 3) : intBetween(3, 6);

    for (let i = 0; i < count; i++) {
      n += 1;
      const donorId = pick(donorIds);
      const profile = donorProfile[donorId];
      const category = pick(profile.categories);
      const kg = Math.round(between(profile.kg[0], profile.kg[1]));

      const postHour = intBetween(9, 16);
      const postMinute = intBetween(0, 59);
      const posted = new Date(date);
      posted.setHours(postHour, postMinute, 0, 0);
      const windowHours = category === 'prepared' ? 2 : category === 'bakery' ? 2 : intBetween(3, 24);
      const deadline = new Date(posted.getTime() + hours(windowHours));

      const offerId = `off-h${n}`;
      const claimed = rand() > 0.33;

      offers.push({
        id: offerId,
        reference: `OF-${String(700 + n).padStart(4, '0')}`,
        donorOrganisationId: donorId,
        postedByUserId: donorUserOf[donorId],
        title: pick(historyTitles[category]),
        description: '',
        category,
        offeredQuantityKg: kg,
        coldChain: coldChainFor[category],
        photo: photoFor[category],
        availableFrom: posted.toISOString(),
        collectionDeadline: deadline.toISOString(),
        status: claimed ? 'collected' : 'expired',
        createdAt: posted.toISOString(),
        expiredAt: claimed ? null : deadline.toISOString(),
        parentOfferId: null,
      });

      if (!claimed) continue;

      /* FEASIBLE = CAPACITY + STORAGE MATCH */
      const feasible = recipientIds.filter((rid) => {
        const org = organisations.find((o) => o.id === rid)!;
        return (
          (org.capacityKg ?? 0) >= kg && (org.storage ?? []).includes(coldChainFor[category])
        );
      });
      const recipientId = feasible.length > 0 ? pick(feasible) : 'org-ubuntu';
      const recipientOrg = organisations.find((o) => o.id === recipientId)!;
      const claimant = users.find((u) => u.organisationId === recipientId);

      const claimDelay = minutes(intBetween(4, 90));
      const claimedAt = new Date(posted.getTime() + claimDelay);
      const claimId = `clm-h${n}`;
      const needsTransport = !recipientOrg.hasTransport;

      claims.push({
        id: claimId,
        offerId,
        recipientOrganisationId: recipientId,
        claimedByUserId: claimant?.id ?? 'usr-thandi',
        needsTransport,
        claimedAt: claimedAt.toISOString(),
        releasedAt: null,
        releaseReason: null,
      });

      if (needsTransport) {
        const driver = pick(driverContacts);
        collections.push({
          id: `col-h${n}`,
          claimId,
          dispatchedByUserId: 'usr-nadia',
          driverName: driver.name,
          driverPhone: driver.phone,
          dispatchedAt: new Date(claimedAt.getTime() + minutes(intBetween(5, 40))).toISOString(),
          status: 'completed',
        });
      }

      /* USUALLY FULL QTY, OCCASIONAL SHORTFALL */
      const shortfall = rand() > 0.88 ? between(0.6, 0.95) : 1;
      const collectedKg = Math.round(kg * shortfall);
      const donorConfirm = new Date(claimedAt.getTime() + minutes(intBetween(20, 120)));
      const recipientConfirm = new Date(donorConfirm.getTime() + minutes(intBetween(5, 70)));

      handovers.push({
        id: `hnd-h${n}`,
        claimId,
        donorConfirmedAt: donorConfirm.toISOString(),
        donorConfirmedByUserId: donorUserOf[donorId],
        donorQuantityKg: collectedKg,
        donorPhoto: photoFor[category],
        recipientConfirmedAt: recipientConfirm.toISOString(),
        recipientConfirmedByUserId: claimant?.id ?? 'usr-thandi',
        recipientQuantityKg: collectedKg,
        recipientCondition: rand() > 0.06 ? 'good' : 'acceptable',
        recipientNote: null,
      });
    }
  }

  return { offers, claims, collections, handovers };
}

const history = generateHistory();

/* CERTIFICATES */

function buildCertificate(
  id: string,
  reference: string,
  donorOrganisationId: string,
  monthsAgo: number,
  status: 'pending' | 'issued',
): TaxCertificate {
  const start = new Date(NOW.getFullYear(), NOW.getMonth() - monthsAgo, 1);
  const end = new Date(NOW.getFullYear(), NOW.getMonth() - monthsAgo + 1, 0, 23, 59, 59);

  const relevant = history.handovers.filter((h) => {
    if (!h.recipientConfirmedAt) return false;
    const when = new Date(h.recipientConfirmedAt).getTime();
    if (when < start.getTime() || when > end.getTime()) return false;
    const claim = history.claims.find((c) => c.id === h.claimId);
    const offer = claim && history.offers.find((o) => o.id === claim.offerId);
    return offer?.donorOrganisationId === donorOrganisationId;
  });

  const byCategory = new Map<FoodCategory, number>();
  let totalKg = 0;
  for (const h of relevant) {
    const claim = history.claims.find((c) => c.id === h.claimId)!;
    const offer = history.offers.find((o) => o.id === claim.offerId)!;
    const kg = h.recipientQuantityKg ?? 0;
    totalKg += kg;
    byCategory.set(offer.category, (byCategory.get(offer.category) ?? 0) + kg);
  }

  /* INDICATIVE WHOLESALE VALUE PER KG (DEMO ONLY) */
  const valuePerKg: Record<FoodCategory, number> = {
    bakery: 22,
    produce: 14,
    dairy: 38,
    prepared: 45,
    dry: 26,
    other: 20,
  };

  return {
    id,
    reference,
    donorOrganisationId,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    totalKg,
    mealEquivalents: Math.round(totalKg / KG_PER_MEAL),
    handoverRecordIds: relevant.map((h) => h.id),
    valuationByCategory: [...byCategory.entries()].map(([category, kg]) => ({
      category,
      kg,
      valueZar: Math.round(kg * valuePerKg[category]),
    })),
    status,
    issuedAt: status === 'issued' ? end.toISOString() : null,
  };
}

export const certificates: TaxCertificate[] = [
  buildCertificate('cert-001', 'TC-2026-041', 'org-kaap', 2, 'issued'),
  buildCertificate('cert-002', 'TC-2026-042', 'org-ouma', 2, 'issued'),
  buildCertificate('cert-003', 'TC-2026-048', 'org-kaap', 1, 'issued'),
  buildCertificate('cert-004', 'TC-2026-049', 'org-ouma', 1, 'issued'),
  buildCertificate('cert-005', 'TC-2026-050', 'org-fruit', 1, 'issued'),
  buildCertificate('cert-006', 'TC-2026-055', 'org-kaap', 0, 'pending'),
  buildCertificate('cert-007', 'TC-2026-056', 'org-ouma', 0, 'pending'),
  buildCertificate('cert-008', 'TC-2026-057', 'org-harbour', 0, 'pending'),
];

/* NOTIFICATIONS */

export const notifications: AppNotification[] = [
  {
    id: 'ntf-001',
    userId: 'usr-riaan',
    kind: 'offer-posted',
    channel: 'push',
    title: 'Offer OF-1001 is live',
    body: '15 organisations were notified. 62 loaves and 40 rolls, collect by 17:30.',
    href: '/donor/offers/off-1001',
    read: false,
    createdAt: fromNow(-minutes(12)),
  },
  {
    id: 'ntf-002',
    userId: 'usr-nosipho',
    kind: 'offer-posted',
    channel: 'whatsapp',
    title: 'New offer near you',
    body: "46 kg bakery, Woodstock, collect by 17:30. Ouma's Bakery.",
    href: '/recipient/offers/off-1001',
    read: false,
    createdAt: fromNow(-minutes(11)),
  },
  {
    id: 'ntf-003',
    userId: 'usr-peter',
    kind: 'offer-posted',
    channel: 'push',
    title: 'New offer near you',
    body: '45 kg chilled dairy, Kenilworth. You have the fridge space.',
    href: '/recipient/offers/off-1002',
    read: false,
    createdAt: fromNow(-hours(3)),
  },
  {
    id: 'ntf-004',
    userId: 'usr-nadia',
    kind: 'dispute',
    channel: 'push',
    title: '3 disputes need a decision',
    body: 'A quantity mismatch, a non-collection and a food condition report.',
    href: '/coordinator/disputes',
    read: false,
    createdAt: fromNow(-hours(6)),
  },
  {
    id: 'ntf-005',
    userId: 'usr-nadia',
    kind: 'verification',
    channel: 'push',
    title: 'Hope Kitchen is waiting on verification',
    body: 'Registered 6 days ago. Site visit not yet booked.',
    href: '/coordinator/verify',
    read: false,
    createdAt: fromNow(-days(1)),
  },
  {
    id: 'ntf-006',
    userId: 'usr-nadia',
    kind: 'offer-claimed',
    channel: 'push',
    title: 'OF-0998 needs a driver',
    body: 'Siyakhula Shelter claimed 21 kg bakery and has no transport.',
    href: '/coordinator/dispatch',
    read: false,
    createdAt: fromNow(-hours(1) - minutes(35)),
  },
  {
    id: 'ntf-007',
    userId: 'usr-zanele',
    kind: 'handover-confirmed',
    channel: 'push',
    title: '3 tax certificates are ready to issue',
    body: 'Kaap Foods, Ouma’s Bakery and Harbour View Hotel for this month.',
    href: '/admin/certificates',
    read: false,
    createdAt: fromNow(-hours(20)),
  },
  {
    id: 'ntf-008',
    userId: 'usr-nomsa',
    kind: 'offer-claimed',
    channel: 'push',
    title: 'OF-1002 has not been claimed yet',
    body: '45 kg chilled dairy. 4 organisations can take it, collection closes in 5 hours.',
    href: '/donor/offers/off-1002',
    read: true,
    createdAt: fromNow(-hours(2)),
  },
];

/* AUDIT */

export const audit: AuditEntry[] = [
  {
    id: 'aud-001',
    actorUserId: 'usr-nadia',
    action: 'Verified organisation',
    target: 'Mitchells Plain Feeding Scheme',
    detail: 'Site visit completed, food handling checked, approved for claiming.',
    at: iso(NOW.getTime() - days(180)),
  },
  {
    id: 'aud-002',
    actorUserId: 'usr-zanele',
    action: 'Disabled account',
    target: 'Marius Coetzee',
    detail: 'Left FEDSA at the end of the contract period.',
    at: iso(NOW.getTime() - days(45)),
  },
  {
    id: 'aud-003',
    actorUserId: 'usr-zanele',
    action: 'Issued tax certificate',
    target: 'TC-2026-048, Kaap Foods',
    detail: 'Built from 31 handover records.',
    at: iso(NOW.getTime() - days(16)),
  },
];

/* INITIAL STATE */

export function createInitialState(): AppState {
  return {
    currentUserId: null,
    language: 'en',
    organisations,
    users,
    offers: [...history.offers, ...disputeOffers, ...inFlightOffers, ...liveOffers],
    claims: [...history.claims, ...disputeClaims, ...inFlightClaims],
    collections: [...history.collections, ...disputeCollections],
    handovers: [...history.handovers, ...disputeHandovers, ...inFlightHandovers],
    notifications,
    certificates,
    disputes,
    audit,
    lastEvent: null,
  };
}
