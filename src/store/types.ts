/* DOMAIN ENTITIES; NO DRIVER ENTITY - DRIVER FIELDS LIVE ON COLLECTION */

export type Role = 'donor' | 'recipient' | 'coordinator' | 'administrator';

export type Language = 'en' | 'af' | 'xh';

export type ColdChain = 'ambient' | 'refrigerated' | 'frozen';

export type FoodCategory = 'bakery' | 'produce' | 'dairy' | 'prepared' | 'dry' | 'other';

export type OfferStatus = 'open' | 'claimed' | 'collected' | 'expired' | 'cancelled';

export type OrgKind = 'donor' | 'recipient';

export type VerificationStatus = 'pending' | 'visit-booked' | 'verified' | 'suspended';

export interface Organisation {
  id: string;
  name: string;
  kind: OrgKind;
  suburb: string;
  /** STRAIGHT-LINE KM FROM OFFICE, STANDS IN FOR REAL GEOCODING */
  distanceKm: number;
  contactName: string;
  contactPhone: string;
  /** RECIPIENTS ONLY: MAX SINGLE COLLECTION KG */
  capacityKg?: number;
  /** RECIPIENTS ONLY: STORAGE CONDITIONS */
  storage?: ColdChain[];
  /** RECIPIENTS ONLY: HAS OWN TRANSPORT */
  hasTransport?: boolean;
  /** RECIPIENTS ONLY: MEALS/DAY, CONTEXT ONLY - NOT FOR RANKING */
  mealsPerDay?: number;
  verification: VerificationStatus;
  /** COORDINATOR'S MATCHING NOTES, FREE TEXT */
  capacityNotes: string;
  joinedAt: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  /** COORDINATOR/ADMIN ACCOUNTS BELONG TO FEDSA, NO ORG */
  organisationId: string | null;
  jobTitle: string;
  language: Language;
  active: boolean;
  /** LOGIN SCREEN BLURB: WHICH CONSTRAINT THIS PERSONA DEMOS */
  personaNote: string;
}

export interface Offer {
  id: string;
  reference: string;
  donorOrganisationId: string;
  postedByUserId: string;
  title: string;
  description: string;
  category: FoodCategory;
  offeredQuantityKg: number;
  coldChain: ColdChain;
  /** ILLUSTRATION KEY, NOT A URL */
  photo: string | null;
  availableFrom: string;
  collectionDeadline: string;
  status: OfferStatus;
  createdAt: string;
  expiredAt: string | null;
  /** SET WHEN SPLIT FROM A PARTIAL COLLECTION */
  parentOfferId: string | null;
}

export interface Claim {
  id: string;
  offerId: string;
  recipientOrganisationId: string;
  claimedByUserId: string;
  needsTransport: boolean;
  claimedAt: string;
  releasedAt: string | null;
  releaseReason: string | null;
}

export interface Collection {
  id: string;
  claimId: string;
  dispatchedByUserId: string;
  driverName: string;
  driverPhone: string;
  dispatchedAt: string;
  status: 'dispatched' | 'completed' | 'cancelled';
}

export type FoodCondition = 'good' | 'acceptable' | 'poor';

export interface HandoverRecord {
  id: string;
  claimId: string;
  /** DONOR CONFIRMS FIRST; RECORD EXISTS BEFORE RECIPIENT CONFIRMS */
  donorConfirmedAt: string | null;
  donorConfirmedByUserId: string | null;
  donorQuantityKg: number | null;
  donorPhoto: string | null;
  recipientConfirmedAt: string | null;
  recipientConfirmedByUserId: string | null;
  recipientQuantityKg: number | null;
  recipientCondition: FoodCondition | null;
  recipientNote: string | null;
}

export type NotificationKind =
  | 'offer-posted'
  | 'offer-claimed'
  | 'claim-released'
  | 'handover-confirmed'
  | 'driver-dispatched'
  | 'verification'
  | 'dispute';

export type NotificationChannel = 'push' | 'whatsapp' | 'sms';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  title: string;
  body: string;
  /** ROUTE OPENED ON TAP */
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface TaxCertificate {
  id: string;
  reference: string;
  donorOrganisationId: string;
  periodStart: string;
  periodEnd: string;
  totalKg: number;
  mealEquivalents: number;
  /** SOURCE HANDOVER RECORDS, FOR TRACEABILITY */
  handoverRecordIds: string[];
  valuationByCategory: { category: FoodCategory; kg: number; valueZar: number }[];
  status: 'pending' | 'issued';
  issuedAt: string | null;
}

export type DisputeType = 'handover-mismatch' | 'non-collection' | 'food-condition';

export type DisputeResolution =
  | 'accepted-donor-figure'
  | 'accepted-recipient-figure'
  | 'noted-and-closed';

export interface Dispute {
  id: string;
  reference: string;
  claimId: string;
  type: DisputeType;
  openedAt: string;
  status: 'open' | 'resolved';
  resolution: DisputeResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
}

/** APP-LEVEL AUDIT TRAIL (FREE DB TIER HAS NONE) */
export interface AuditEntry {
  id: string;
  actorUserId: string;
  action: string;
  target: string;
  detail: string;
  at: string;
}

export interface AppState {
  currentUserId: string | null;
  language: Language;
  organisations: Organisation[];
  users: User[];
  offers: Offer[];
  claims: Claim[];
  collections: Collection[];
  handovers: HandoverRecord[];
  notifications: AppNotification[];
  certificates: TaxCertificate[];
  disputes: Dispute[];
  audit: AuditEntry[];
  /** LAST ACTION RESULT, CLEARED AFTER READ */
  lastEvent: { kind: string; id: string; message: string } | null;
}
