/* DOMAIN ENTITIES; NO DRIVER ENTITY - DRIVER FIELDS LIVE ON COLLECTION */

import type {
  ClaimStatus,
  ColdChain,
  Condition,
  FoodCategory,
  GeoPoint,
  Language,
  NotificationChannel,
  NotificationKind,
  OfferStatus,
  OrganisationStatus,
  OrganisationType,
  Role,
} from '@fedsa/contract';

export type {
  ClaimStatus,
  ColdChain,
  Condition,
  FoodCategory,
  Language,
  NotificationChannel,
  NotificationKind,
  OfferStatus,
  OrganisationStatus,
  OrganisationType,
  Role,
};

export interface Organisation {
  id: string;
  name: string;
  type: OrganisationType;
  suburb: string;
  /** suburb centroid. distance is worked out from it for display only */
  location: GeoPoint;
  contactName: string;
  contactPhone: string;
  /** RECIPIENTS ONLY: MAX SINGLE COLLECTION KG */
  maxCapacityKg?: number;
  /** RECIPIENTS ONLY: STORAGE CONDITIONS */
  storageAmbient?: boolean;
  storageRefrigerated?: boolean;
  storageFrozen?: boolean;
  /** RECIPIENTS ONLY: HAS OWN TRANSPORT */
  hasTransport?: boolean;
  /** RECIPIENTS ONLY: MEALS/DAY, CONTEXT ONLY - NOT FOR RANKING */
  mealsPerDay?: number;
  status: OrganisationStatus;
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
  mustChangePassword?: boolean;
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
  transportNeeded: boolean;
  status: ClaimStatus;
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
  scheduledFor?: string | null;
  status: 'dispatched' | 'completed' | 'cancelled';
}

/** created when the donor confirms. the recipient fields start null */
export interface HandoverRecord {
  id: string;
  claimId: string;
  donorConfirmedAt: string;
  donorConfirmedByUserId: string;
  /** entered by the donor. the figure every report uses */
  collectedQuantityKg: number;
  donorPhoto: string | null;
  recipientConfirmedAt: string | null;
  recipientConfirmedByUserId: string | null;
  /** `problem` puts the record in the coordinator's disputes list */
  conditionOnReceipt: Condition | null;
  conditionNotes: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  title: string;
  body: string;
  /** ROUTE OPENED ON TAP */
  href: string | null;
  readAt: string | null;
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
  audit: AuditEntry[];
  /** LAST ACTION RESULT, CLEARED AFTER READ */
  lastEvent: { kind: string; id: string; message: string } | null;
}
