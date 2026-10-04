import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import {
  suburbLocation,
  type Language,
  type OrganisationStatus,
  type OrganisationType,
  type RegisterRequest,
  type Suburb,
} from '@fedsa/contract';
import bcrypt from 'bcryptjs';
import type { Router } from 'express';
import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import twilio from 'twilio';
import { createApp } from '../../src/app.js';
import {
  AuditLogRepository,
  ClaimRepository,
  CollectionRepository,
  CounterRepository,
  HandoverRepository,
  HealthRepository,
  NotificationRepository,
  OfferRepository,
  OrganisationModel,
  OrganisationRepository,
  SessionRepository,
  TaxCertificateRepository,
  UserModel,
  UserRepository,
  ValuationRateRepository,
} from '../../src/db/index.js';
import { createLogger } from '../../src/logger.js';
import { createSessionStore } from '../../src/middleware/session.js';
import {
  TWILIO_SIGNATURE_HEADER,
  type TwilioWebhookSettings,
} from '../../src/middleware/twilio-signature.js';
import type { NotificationChannel } from '../../src/notifications/notification-channel.js';
import { LocalPhotoStore } from '../../src/photos/local-photo-store.js';
import type { PhotoStore } from '../../src/photos/photo-store.js';
import { AuditService } from '../../src/services/audit-service.js';
import type { ClaimNotifier } from '../../src/services/claim-notifier.js';
import { ClaimService } from '../../src/services/claim-service.js';
import { DEFAULT_RADIUS_KM } from '../../src/services/eligibility.js';
import { HealthService } from '../../src/services/health-service.js';
import { NotificationService } from '../../src/services/notification-service.js';
import type { OfferNotifier } from '../../src/services/offer-notifier.js';
import { OfferService } from '../../src/services/offer-service.js';
import { OrganisationService } from '../../src/services/organisation-service.js';
import { ReportingService } from '../../src/services/reporting-service.js';
import { UserService } from '../../src/services/user-service.js';
import { WebhookService } from '../../src/services/webhook-service.js';
import { TestClient } from '../test-client.js';

/** obviously fake. tests sign their own cookies and nothing else */
export const TEST_SESSION_SECRET = 'integration-test-session-secret';

export const TEST_PASSWORD = 'correct horse battery';

/** the organisation service as the app builds it, for tests that call it directly */
export function newOrganisationService() {
  return new OrganisationService(
    new OrganisationRepository(),
    new OfferRepository(),
    new ClaimRepository(),
    new HandoverRepository(),
    new AuditService(new AuditLogRepository()),
  );
}

export function newReportingService() {
  return new ReportingService(
    new HandoverRepository(),
    new OfferRepository(),
    new OrganisationRepository(),
    new ValuationRateRepository(),
    new TaxCertificateRepository(),
    new CounterRepository(),
    new AuditService(new AuditLogRepository()),
  );
}

export interface NotificationTestOptions {
  channels?: NotificationChannel[];
  mirror?: boolean;
  vapidPublicKey?: string | null;
  logger?: Logger;
}

/** no channels unless a test passes some, so only inbox rows are written */
export function newNotificationService(options: NotificationTestOptions = {}) {
  return new NotificationService(new NotificationRepository(), new UserRepository(), {
    channels: options.channels ?? [],
    mirror: options.mirror ?? true,
    vapidPublicKey: options.vapidPublicKey ?? null,
    logger: options.logger ?? createLogger({ write: () => {} }),
  });
}

export interface OfferTestOptions {
  photos?: PhotoStore;
  notifier?: OfferNotifier;
  newReference?: () => string;
}

/** a test that posts photos passes a store in a temporary folder it removes afterwards */
export function newOfferService(options: OfferTestOptions = {}) {
  const logger = createLogger({ write: () => {} });
  return new OfferService(
    new OfferRepository(),
    new OrganisationRepository(),
    new ClaimRepository(),
    new CollectionRepository(),
    new HandoverRepository(),
    new AuditService(new AuditLogRepository()),
    options.photos ?? new LocalPhotoStore(),
    options.notifier ?? newNotificationService(),
    { radiusKm: DEFAULT_RADIUS_KM, logger, newReference: options.newReference },
  );
}

export interface ClaimTestOptions {
  offerNotifier?: OfferNotifier;
  claimNotifier?: ClaimNotifier;
}

/** built on the same offer service the app uses, as in production */
export function newClaimService(offers: OfferService, options: ClaimTestOptions = {}) {
  const logger = createLogger({ write: () => {} });
  const notifications = newNotificationService();
  return new ClaimService(
    new ClaimRepository(),
    new OfferRepository(),
    new OrganisationRepository(),
    new HandoverRepository(),
    offers,
    options.offerNotifier ?? notifications,
    options.claimNotifier ?? notifications,
    logger,
  );
}

/** obviously fake. Twilio's signature is checked against these and nothing is ever sent */
export const TEST_TWILIO_WEBHOOKS: TwilioWebhookSettings = {
  authToken: 'fake-twilio-auth-token-for-tests',
  publicUrl: 'https://fedsa.example.org',
};

export function newWebhookService(claims: ClaimService) {
  return new WebhookService(
    new UserRepository(),
    new OrganisationRepository(),
    new OfferRepository(),
    new NotificationRepository(),
    claims,
    createLogger({ write: () => {} }),
  );
}

/** the signature Twilio would send for this path and form, made with the test token */
export function twilioSignatureFor(path: string, params: Record<string, string>) {
  return twilio.getExpectedTwilioSignature(
    TEST_TWILIO_WEBHOOKS.authToken,
    `${TEST_TWILIO_WEBHOOKS.publicUrl}${path}`,
    params,
  );
}

/** posts a form the way Twilio does. null sends no signature header at all */
export function twilioPost(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  signature: string | null = twilioSignatureFor(path, params),
) {
  const headers: Record<string, string> =
    signature === null ? {} : { [TWILIO_SIGNATURE_HEADER]: signature };
  return new TestClient(baseUrl).request('POST', path, new URLSearchParams(params), headers);
}

/** starts the real app on the test database. needs `startTestDb` to have run */
export async function startTestApp(
  extraRouters: Router[] = [],
  offers?: OfferService,
  notifications?: NotificationService,
  claims?: ClaimService,
  twilioWebhooks: TwilioWebhookSettings | null = TEST_TWILIO_WEBHOOKS,
) {
  // a default parameter cannot see a later one, and offers has to share the notification service
  notifications ??= newNotificationService();
  offers ??= newOfferService({ notifier: notifications });
  claims ??= newClaimService(offers, {
    offerNotifier: notifications,
    claimNotifier: notifications,
  });

  const app = createApp({
    logger: createLogger({ write: () => {} }),
    services: {
      health: new HealthService(new HealthRepository(), 'test-sha'),
      users: new UserService(
        new UserRepository(),
        new OrganisationRepository(),
        new SessionRepository(),
        new AuditService(new AuditLogRepository()),
      ),
      organisations: newOrganisationService(),
      offers,
      claims,
      notifications,
      reports: newReportingService(),
      webhooks: newWebhookService(claims),
      audit: new AuditService(new AuditLogRepository()),
    },
    session: {
      secret: TEST_SESSION_SECRET,
      secureCookie: false,
      store: await createSessionStore(),
    },
    twilioWebhooks,
    extraRouters,
  });
  const server = app.listen(0);
  await once(server, 'listening');

  return {
    app,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let emailCount = 0;

export function uniqueEmail(label: string) {
  emailCount += 1;
  return `${label}.${Date.now()}.${emailCount}@example.org`;
}

export function donorRegistration(email = uniqueEmail('donor')): RegisterRequest {
  return {
    role: 'donor',
    organisation: {
      name: "Ouma's Bakery",
      addressLine: '12 Long Street',
      suburb: 'Woodstock',
      contactName: 'Riaan de Villiers',
      contactPhone: '+27821234567',
      contactEmail: 'bakery@example.org',
    },
    user: {
      fullName: 'Riaan de Villiers',
      email,
      password: TEST_PASSWORD,
      phone: '+27821234567',
      languagePreference: 'en',
    },
    consent: true,
  };
}

export function recipientRegistration(email = uniqueEmail('recipient')): RegisterRequest {
  return {
    role: 'recipient',
    organisation: {
      name: 'Siyakhula Shelter',
      addressLine: '4 Lansdowne Road',
      suburb: 'Khayelitsha',
      contactName: 'Nosipho Dlamini',
      contactPhone: '+27831234567',
      contactEmail: 'shelter@example.org',
      storageAmbient: true,
      storageRefrigerated: false,
      storageFrozen: false,
      hasTransport: false,
    },
    user: {
      fullName: 'Nosipho Dlamini',
      email,
      password: TEST_PASSWORD,
      phone: '+27831234567',
      languagePreference: 'xh',
    },
    consent: true,
  };
}

/** a client that has fetched a CSRF token, ready to register or sign in */
export async function anonymousClient(baseUrl: string) {
  const client = new TestClient(baseUrl);
  await client.fetchCsrfToken();
  return client;
}

/** signing in starts a new session, so the client fetches a fresh token afterwards */
export async function signedInClient(baseUrl: string, email: string, password = TEST_PASSWORD) {
  const client = await anonymousClient(baseUrl);
  const res = await client.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`sign-in failed with ${res.status}`);
  await client.fetchCsrfToken();
  return client;
}

/**
 * stored directly, so a test can set any status and skip the full-cost hash of
 * registration. recipients default to verified, with dry storage only
 */
export function createOrganisation(fields: {
  type: OrganisationType;
  status?: OrganisationStatus;
  name?: string;
  suburb?: Suburb;
  storageAmbient?: boolean;
  storageRefrigerated?: boolean;
  storageFrozen?: boolean;
  maxCapacityKg?: number | null;
  hasTransport?: boolean;
}) {
  const suburb = fields.suburb ?? 'Woodstock';
  const base = {
    name: fields.name ?? (fields.type === 'donor' ? "Ouma's Bakery" : 'Siyakhula Shelter'),
    type: fields.type,
    status: fields.status ?? (fields.type === 'donor' ? 'active' : 'verified'),
    addressLine: '12 Long Street',
    suburb,
    city: 'Cape Town',
    location: suburbLocation(suburb),
    contactName: 'Test Contact',
    contactPhone: '+27820000000',
    contactEmail: 'organisation@example.org',
  };
  if (fields.type === 'donor') return OrganisationModel.create(base);
  return OrganisationModel.create({
    ...base,
    storageAmbient: fields.storageAmbient ?? true,
    storageRefrigerated: fields.storageRefrigerated ?? false,
    storageFrozen: fields.storageFrozen ?? false,
    maxCapacityKg: fields.maxCapacityKg ?? null,
    hasTransport: fields.hasTransport ?? false,
  });
}

let testPasswordHash: Promise<string> | undefined;

/** coordinators, administrators and accounts in odd states cannot come from registration */
export async function createUser(fields: {
  role: 'donor' | 'recipient' | 'coordinator' | 'administrator';
  organisationId?: Types.ObjectId | null;
  status?: 'active' | 'disabled';
  mustChangePassword?: boolean;
  phone?: string;
  languagePreference?: Language;
}) {
  // a low cost keeps the suite fast. registration covers the real cost
  testPasswordHash ??= bcrypt.hash(TEST_PASSWORD, 4);
  return UserModel.create({
    organisationId: fields.organisationId ?? null,
    role: fields.role,
    fullName: 'Test User',
    email: uniqueEmail(fields.role),
    passwordHash: await testPasswordHash,
    phone: fields.phone ?? '+27820000000',
    languagePreference: fields.languagePreference ?? 'en',
    status: fields.status ?? 'active',
    mustChangePassword: fields.mustChangePassword ?? false,
  });
}
