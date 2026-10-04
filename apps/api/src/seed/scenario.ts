import type { FoodCategory, Language, OrganisationStatus, Role, Suburb } from '@fedsa/contract';

export interface Person {
  key: string;
  fullName: string;
  role: Role;
  email: string;
  phone: string;
  languagePreference: Language;
  status?: 'active' | 'disabled';
}

/** what a donor usually gives, which drives the generated history */
export interface DonorHabits {
  categories: FoodCategory[];
  kg: [number, number];
  /** minutes after midnight in South African time */
  postsBetween: [number, number];
  windowMinutes: [number, number];
}

interface OrganisationBase {
  key: string;
  name: string;
  suburb: Suburb;
  addressLine: string;
  capacityNotes: string;
  person: Person;
}

export interface DonorSeed extends OrganisationBase {
  type: 'donor';
  habits: DonorHabits;
}

export interface RecipientSeed extends OrganisationBase {
  type: 'recipient';
  status: OrganisationStatus;
  storageAmbient: boolean;
  storageRefrigerated: boolean;
  storageFrozen: boolean;
  maxCapacityKg: number | null;
  hasTransport: boolean;
  mealsPerDay: number;
}

/** +27 followed by a zero is not a South African number and cannot reach a real phone */
export function fakePhone(n: number) {
  return `+27000000${String(n).padStart(3, '0')}`;
}

const at = (hour: number, minute = 0) => hour * 60 + minute;

export const DONORS: DonorSeed[] = [
  {
    key: 'ouma',
    type: 'donor',
    name: "Ouma's Bakery",
    suburb: 'Woodstock',
    addressLine: 'Victoria Road',
    capacityNotes:
      'Knows his surplus at 16:00 cash-up and locks up at 17:30. Will not fill in forms. Keep posting to three taps.',
    person: {
      key: 'riaan',
      fullName: 'Riaan de Villiers',
      role: 'donor',
      email: 'riaan@oumasbakery.example',
      phone: fakePhone(1),
      languagePreference: 'en',
    },
    habits: {
      categories: ['bakery'],
      kg: [18, 62],
      postsBetween: [at(16), at(16, 20)],
      windowMinutes: [70, 90],
    },
  },
  {
    key: 'kaap',
    type: 'donor',
    name: 'Kaap Foods',
    suburb: 'Kenilworth',
    addressLine: 'Main Road',
    capacityNotes:
      'Near-expiry stock flagged at the morning stock check, so a day-long window rather than 90 minutes. Head office requires a paper trail and tax certificates for anything leaving the store.',
    person: {
      key: 'nomsa',
      fullName: 'Nomsa Sithole',
      role: 'donor',
      email: 'nomsa@kaapfoods.example',
      phone: fakePhone(2),
      languagePreference: 'en',
    },
    habits: {
      categories: ['produce', 'dairy', 'dry'],
      kg: [60, 240],
      postsBetween: [at(8), at(10)],
      windowMinutes: [360, 540],
    },
  },
  {
    key: 'deli',
    type: 'donor',
    name: 'Woodstock Deli & Bistro',
    suburb: 'Woodstock',
    addressLine: 'Albert Road',
    capacityNotes: 'Prepared food only. Two-hour window from posting, never longer.',
    person: {
      key: 'shireen',
      fullName: 'Shireen Adams',
      role: 'donor',
      email: 'shireen@woodstockdeli.example',
      phone: fakePhone(3),
      languagePreference: 'af',
    },
    habits: {
      categories: ['prepared'],
      kg: [8, 32],
      postsBetween: [at(14), at(15)],
      windowMinutes: [110, 120],
    },
  },
  {
    key: 'fruit',
    type: 'donor',
    name: 'Salt River Fruit Market',
    suburb: 'Salt River',
    addressLine: 'Voortrekker Road',
    capacityNotes: 'Posts most mornings. High volume, short shelf life, always ambient.',
    person: {
      key: 'yusuf',
      fullName: 'Yusuf Parker',
      role: 'donor',
      email: 'yusuf@saltriverfruit.example',
      phone: fakePhone(4),
      languagePreference: 'en',
    },
    habits: {
      categories: ['produce'],
      kg: [45, 190],
      postsBetween: [at(8), at(11)],
      windowMinutes: [300, 420],
    },
  },
  {
    key: 'bokaap',
    type: 'donor',
    name: 'Bo-Kaap Bakery',
    suburb: 'Bo-Kaap',
    addressLine: 'Wale Street',
    capacityNotes: 'Small but reliable. Bread and pastries, six days a week.',
    person: {
      key: 'faiza',
      fullName: 'Faiza Ismail',
      role: 'donor',
      email: 'faiza@bokaapbakery.example',
      phone: fakePhone(5),
      languagePreference: 'en',
    },
    habits: {
      categories: ['bakery'],
      kg: [12, 40],
      postsBetween: [at(15), at(16, 30)],
      windowMinutes: [90, 120],
    },
  },
  {
    key: 'harbour',
    type: 'donor',
    name: 'Harbour View Hotel',
    suburb: 'Green Point',
    addressLine: 'Beach Road',
    capacityNotes:
      'Banqueting surplus, irregular but large. Insists on a photographed handover record before releasing anything.',
    person: {
      key: 'dean',
      fullName: 'Dean Cloete',
      role: 'donor',
      email: 'dean@harbourview.example',
      phone: fakePhone(6),
      languagePreference: 'en',
    },
    habits: {
      categories: ['prepared', 'other'],
      kg: [25, 110],
      postsBetween: [at(11), at(15)],
      windowMinutes: [120, 240],
    },
  },
];

export const RECIPIENTS: RecipientSeed[] = [
  {
    key: 'siyakhula',
    type: 'recipient',
    name: 'Siyakhula Shelter',
    suburb: 'Khayelitsha',
    addressLine: 'Lansdowne Road',
    status: 'active',
    storageAmbient: true,
    storageRefrigerated: false,
    storageFrozen: true,
    maxCapacityKg: 60,
    hasTransport: false,
    mealsPerDay: 120,
    capacityNotes:
      'One small chest freezer, no fridge, so nothing chilled. No vehicle at all, so every collection needs a driver. Cooking starts at 15:30, which is exactly when the offers land. The phone is shared between three staff and she reads isiXhosa most comfortably.',
    person: {
      key: 'nosipho',
      fullName: 'Nosipho Dlamini',
      role: 'recipient',
      email: 'nosipho@siyakhula.example',
      phone: fakePhone(11),
      languagePreference: 'xh',
    },
  },
  {
    key: 'stmichaels',
    type: 'recipient',
    name: "St Michael's Night Shelter",
    suburb: 'Observatory',
    addressLine: 'Lower Main Road',
    status: 'active',
    storageAmbient: true,
    storageRefrigerated: true,
    storageFrozen: false,
    maxCapacityKg: 150,
    hasTransport: true,
    mealsPerDay: 90,
    capacityNotes:
      'Fridge, small van, desktop computer. Plans menus a week ahead and wants to know on Monday what he is cooking on Thursday. Takes up to 150 kg in two van runs. Best organisation in the network for anything scheduled.',
    person: {
      key: 'peter',
      fullName: 'Peter Molefe',
      role: 'recipient',
      email: 'peter@stmichaels.example',
      phone: fakePhone(12),
      languagePreference: 'en',
    },
  },
  {
    key: 'ubuntu',
    type: 'recipient',
    name: 'Ubuntu Soup Kitchen',
    suburb: 'Langa',
    addressLine: 'Washington Street',
    status: 'active',
    storageAmbient: true,
    storageRefrigerated: true,
    storageFrozen: true,
    maxCapacityKg: 200,
    hasTransport: true,
    mealsPerDay: 260,
    capacityNotes:
      'Largest recipient in the network. Cold room, chest freezers and a bakkie. The only organisation that can absorb a full supermarket produce run.',
    person: {
      key: 'thandi',
      fullName: 'Thandi Nkosi',
      role: 'recipient',
      email: 'thandi@ubuntukitchen.example',
      phone: fakePhone(13),
      languagePreference: 'xh',
    },
  },
  {
    key: 'masi',
    type: 'recipient',
    name: 'Masiphumelele Care Centre',
    suburb: 'Masiphumelele',
    addressLine: 'Kommetjie Road',
    status: 'active',
    storageAmbient: true,
    storageRefrigerated: false,
    storageFrozen: false,
    maxCapacityKg: 45,
    hasTransport: false,
    mealsPerDay: 70,
    capacityNotes:
      'Dry storage only. Far out, so a driver is essential and the collection window has to allow an hour of travel.',
    person: {
      key: 'lindiwe',
      fullName: 'Lindiwe Mabaso',
      role: 'recipient',
      email: 'lindiwe@masicare.example',
      phone: fakePhone(14),
      languagePreference: 'xh',
    },
  },
  {
    key: 'athlone',
    type: 'recipient',
    name: 'Athlone Haven',
    suburb: 'Athlone',
    addressLine: 'Klipfontein Road',
    status: 'active',
    storageAmbient: true,
    storageRefrigerated: true,
    storageFrozen: false,
    maxCapacityKg: 150,
    hasTransport: false,
    mealsPerDay: 85,
    capacityNotes:
      'Fridge and a large dry store, but no vehicle, so big loads need a driver. Reliable on confirmations.',
    person: {
      key: 'gadija',
      fullName: 'Gadija Samaai',
      role: 'recipient',
      email: 'gadija@athlonehaven.example',
      phone: fakePhone(15),
      languagePreference: 'af',
    },
  },
  {
    key: 'mitchells',
    type: 'recipient',
    name: 'Mitchells Plain Feeding Scheme',
    suburb: 'Mitchells Plain',
    addressLine: 'AZ Berman Drive',
    status: 'active',
    storageAmbient: true,
    storageRefrigerated: true,
    storageFrozen: true,
    maxCapacityKg: 200,
    hasTransport: true,
    mealsPerDay: 150,
    capacityNotes:
      'Own transport, two freezers and a walk-in fridge. Takes bulk bakery and full produce runs well.',
    person: {
      key: 'riedwaan',
      fullName: 'Riedwaan Jacobs',
      role: 'recipient',
      email: 'riedwaan@mpfeeding.example',
      phone: fakePhone(16),
      languagePreference: 'af',
    },
  },
  {
    key: 'hope',
    type: 'recipient',
    name: 'Hope Kitchen',
    suburb: 'Delft',
    addressLine: 'Main Road',
    status: 'pending',
    storageAmbient: true,
    storageRefrigerated: false,
    storageFrozen: false,
    maxCapacityKg: 50,
    hasTransport: false,
    mealsPerDay: 60,
    capacityNotes: '',
    person: {
      key: 'beauty',
      fullName: 'Beauty Mokoena',
      role: 'recipient',
      email: 'beauty@hopekitchen.example',
      phone: fakePhone(17),
      languagePreference: 'xh',
    },
  },
];

export const NADIA: Person = {
  key: 'nadia',
  fullName: 'Nadia Petersen',
  role: 'coordinator',
  email: 'nadia@fedsa.example',
  phone: fakePhone(21),
  languagePreference: 'en',
};

export const ZANELE: Person = {
  key: 'zanele',
  fullName: 'Zanele Booi',
  role: 'administrator',
  email: 'zanele@fedsa.example',
  phone: fakePhone(22),
  languagePreference: 'en',
};

/** a former relief coordinator, for a disabled account in the accounts list */
export const MARIUS: Person = {
  key: 'marius',
  fullName: 'Marius Coetzee',
  role: 'coordinator',
  email: 'marius@fedsa.example',
  phone: fakePhone(23),
  languagePreference: 'af',
  status: 'disabled',
};

/** drivers have no accounts and appear only on the collections they were sent */
export const DRIVERS = [
  { name: 'Faried Salie', phone: fakePhone(31) },
  { name: 'Sipho Ndlovu', phone: fakePhone(32) },
  { name: 'Charmaine Botha', phone: fakePhone(33) },
  { name: 'Ashwin Daniels', phone: fakePhone(34) },
];

/** placeholders until the client supplies real figures. rand per kilogram */
export const PLACEHOLDER_RATES: Record<FoodCategory, number> = {
  bakery: 22,
  produce: 14,
  dairy: 38,
  prepared: 45,
  dry: 26,
  other: 20,
};

export const TITLES: Record<FoodCategory, string[]> = {
  bakery: ['Bread and rolls', 'End of day bake', 'Loaves and pastries', 'Day-old bread'],
  produce: ['Mixed vegetables', 'Fruit and veg', 'Butternut and cabbage', 'Salad vegetables'],
  dairy: ['Short-date dairy', 'Milk and yoghurt', 'Cheese and butter'],
  prepared: ['Prepared meals', 'Function surplus', 'Lunch service surplus'],
  dry: ['Dry goods', 'Rice, pasta and tins', 'Store cupboard stock'],
  other: ['Mixed grocery', 'Assorted surplus'],
};

export const COLD_CHAIN: Record<FoodCategory, 'ambient' | 'refrigerated'> = {
  bakery: 'ambient',
  produce: 'ambient',
  dairy: 'refrigerated',
  prepared: 'refrigerated',
  dry: 'ambient',
  other: 'ambient',
};

/** about the organisation's own day, never about the people it feeds */
export const RELEASE_REASONS = [
  'Our driver is out on another run',
  'The fridge is full after a delivery this morning',
  'Cooking has already started and we cannot fit it in today',
  'Claimed by mistake on the shared phone',
];
