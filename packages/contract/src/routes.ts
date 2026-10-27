import { z } from 'zod';
import {
  ChangePasswordRequest,
  CsrfResponse,
  DeletePushSubscriptionRequest,
  HealthResponse,
  LoginRequest,
  PushSubscriptionRequest,
  RegisterRequest,
  SessionResponse,
  UpdateMeRequest,
  UserResponse,
  VapidKeyResponse,
} from './auth.js';
import {
  CertificateListResponse,
  CertificateResponse,
  IssueCertificateRequest,
  ListCertificatesQuery,
  UpdateValuationRatesRequest,
  ValuationRateListResponse,
} from './certificates.js';
import {
  ClaimListResponse,
  ClaimWithOfferResponse,
  ListClaimsQuery,
  OverrideClaimRequest,
  ReleaseClaimRequest,
} from './claims.js';
import type { Role } from './enums.js';
import {
  CollectionResponse,
  DispatchRequest,
  DonorConfirmFields,
  DonorConfirmResponse,
  HandoverListResponse,
  HandoverResponse,
  ListHandoversQuery,
  RecipientConfirmRequest,
  RecipientConfirmResponse,
  ResolutionRequest,
  UpdateCollectionRequest,
} from './handover.js';
import { NotificationListResponse, TwilioInboundBody, TwilioStatusBody } from './notifications.js';
import {
  CancelOfferRequest,
  ClaimRequest,
  ClaimResponse,
  ListOffersQuery,
  OfferDetailResponse,
  OfferListResponse,
  OfferResponse,
  PostOfferFields,
  PostOfferResponse,
} from './offers.js';
import {
  CapacityNotesRequest,
  ListOrganisationsQuery,
  OrganisationDetailResponse,
  OrganisationListResponse,
  OrganisationResponse,
  UpdateDonorOrganisationRequest,
  UpdateRecipientOrganisationRequest,
  VerificationRequest,
} from './organisations.js';
import {
  ExportQuery,
  ImpactQuery,
  ImpactResponse,
  OutcomesResponse,
  ReportRangeQuery,
} from './reports.js';
import {
  AuditLogQuery,
  AuditLogResponse,
  CreateUserRequest,
  CreateUserResponse,
  ListUsersQuery,
  UpdateUserRequest,
  UserListResponse,
} from './users.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** `any` is any signed-in user. `twilio` is a signed webhook with no session or CSRF */
export type Access = 'public' | 'any' | 'twilio' | readonly Role[];

export interface RouteSpec {
  method: HttpMethod;
  path: string;
  access: Access;
  /** another organisation's caller gets 404, not 403 */
  ownedByOrganisation?: true;
  multipart?: true;
  body?: z.ZodType;
  query?: z.ZodType;
  status: number;
  /** absent for empty, file, redirect and TwiML responses */
  response?: z.ZodType;
}

const D = 'donor';
const R = 'recipient';
const C = 'coordinator';
const A = 'administrator';

export const ROUTES = [
  { method: 'GET', path: '/api/health', access: 'public', status: 200, response: HealthResponse },
  { method: 'GET', path: '/api/auth/csrf', access: 'public', status: 200, response: CsrfResponse },
  {
    method: 'GET',
    path: '/api/openapi.json',
    access: 'public',
    status: 200,
    response: z.object({
      openapi: z.string(),
      info: z.unknown(),
      servers: z.unknown(),
      paths: z.record(z.string(), z.unknown()),
      components: z.unknown(),
    }),
  },
  {
    method: 'POST',
    path: '/api/auth/register',
    access: 'public',
    body: RegisterRequest,
    status: 201,
    response: SessionResponse,
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    access: 'public',
    body: LoginRequest,
    status: 200,
    response: SessionResponse,
  },
  { method: 'POST', path: '/api/auth/logout', access: 'any', status: 204 },
  { method: 'GET', path: '/api/me', access: 'any', status: 200, response: SessionResponse },
  {
    method: 'PATCH',
    path: '/api/me',
    access: 'any',
    body: UpdateMeRequest,
    status: 200,
    response: UserResponse,
  },
  {
    method: 'POST',
    path: '/api/me/password',
    access: 'any',
    body: ChangePasswordRequest,
    status: 204,
  },
  {
    method: 'POST',
    path: '/api/me/push-subscriptions',
    access: 'any',
    body: PushSubscriptionRequest,
    status: 201,
  },
  {
    method: 'DELETE',
    path: '/api/me/push-subscriptions',
    access: 'any',
    body: DeletePushSubscriptionRequest,
    status: 204,
  },
  {
    method: 'GET',
    path: '/api/push/public-key',
    access: 'public',
    status: 200,
    response: VapidKeyResponse,
  },

  {
    method: 'GET',
    path: '/api/organisations/me',
    access: [D, R],
    status: 200,
    response: OrganisationResponse,
  },
  {
    method: 'PATCH',
    path: '/api/organisations/me',
    access: [D, R],
    body: z.union([UpdateDonorOrganisationRequest, UpdateRecipientOrganisationRequest]),
    status: 200,
    response: OrganisationResponse,
  },
  {
    method: 'GET',
    path: '/api/organisations',
    access: [C, A],
    query: ListOrganisationsQuery,
    status: 200,
    response: OrganisationListResponse,
  },
  {
    method: 'GET',
    path: '/api/organisations/:id',
    access: [C, A],
    status: 200,
    response: OrganisationDetailResponse,
  },
  {
    method: 'POST',
    path: '/api/organisations/:id/verification',
    access: [C],
    body: VerificationRequest,
    status: 200,
    response: OrganisationResponse,
  },
  {
    method: 'PUT',
    path: '/api/organisations/:id/notes',
    access: [C],
    body: CapacityNotesRequest,
    status: 200,
    response: OrganisationResponse,
  },

  {
    method: 'POST',
    path: '/api/offers',
    access: [D],
    multipart: true,
    body: PostOfferFields,
    status: 201,
    response: PostOfferResponse,
  },
  {
    method: 'GET',
    path: '/api/offers',
    access: [D, R, C],
    query: ListOffersQuery,
    status: 200,
    response: OfferListResponse,
  },
  {
    method: 'GET',
    path: '/api/offers/:id',
    access: [D, R, C],
    ownedByOrganisation: true,
    status: 200,
    response: OfferDetailResponse,
  },
  {
    method: 'POST',
    path: '/api/offers/:id/cancel',
    access: [D, C],
    ownedByOrganisation: true,
    body: CancelOfferRequest,
    status: 200,
    response: OfferResponse,
  },
  {
    method: 'POST',
    path: '/api/offers/:id/claim',
    access: [R],
    ownedByOrganisation: true,
    body: ClaimRequest,
    status: 201,
    response: ClaimResponse,
  },
  {
    method: 'GET',
    path: '/api/claims',
    access: [R, C],
    query: ListClaimsQuery,
    status: 200,
    response: ClaimListResponse,
  },
  {
    method: 'POST',
    path: '/api/claims/:id/release',
    access: [R],
    ownedByOrganisation: true,
    body: ReleaseClaimRequest,
    status: 200,
    response: ClaimWithOfferResponse,
  },
  {
    method: 'POST',
    path: '/api/claims/:id/override',
    access: [C],
    body: OverrideClaimRequest,
    status: 200,
    response: ClaimWithOfferResponse,
  },

  {
    method: 'POST',
    path: '/api/claims/:id/collection',
    access: [C],
    body: DispatchRequest,
    status: 201,
    response: CollectionResponse,
  },
  {
    method: 'PATCH',
    path: '/api/collections/:id',
    access: [C],
    body: UpdateCollectionRequest,
    status: 200,
    response: CollectionResponse,
  },
  {
    method: 'POST',
    path: '/api/offers/:id/handover/donor-confirm',
    access: [D],
    ownedByOrganisation: true,
    multipart: true,
    body: DonorConfirmFields,
    status: 201,
    response: DonorConfirmResponse,
  },
  {
    method: 'POST',
    path: '/api/offers/:id/handover/recipient-confirm',
    access: [R],
    ownedByOrganisation: true,
    body: RecipientConfirmRequest,
    status: 200,
    response: RecipientConfirmResponse,
  },
  {
    method: 'GET',
    path: '/api/handovers',
    access: [C],
    query: ListHandoversQuery,
    status: 200,
    response: HandoverListResponse,
  },
  {
    method: 'POST',
    path: '/api/handovers/:id/resolution',
    access: [C],
    body: ResolutionRequest,
    status: 200,
    response: HandoverResponse,
  },
  {
    method: 'GET',
    path: '/api/handovers/:id/photo',
    access: [D, R, C, A],
    ownedByOrganisation: true,
    status: 302,
  },

  {
    method: 'GET',
    path: '/api/notifications',
    access: 'any',
    status: 200,
    response: NotificationListResponse,
  },
  { method: 'POST', path: '/api/notifications/:id/read', access: 'any', status: 204 },
  {
    method: 'POST',
    path: '/api/webhooks/twilio/inbound',
    access: 'twilio',
    body: TwilioInboundBody,
    status: 200,
  },
  {
    method: 'POST',
    path: '/api/webhooks/twilio/status',
    access: 'twilio',
    body: TwilioStatusBody,
    status: 204,
  },

  {
    method: 'GET',
    path: '/api/reports/impact',
    access: [A],
    query: ImpactQuery,
    status: 200,
    response: ImpactResponse,
  },
  {
    method: 'GET',
    path: '/api/reports/outcomes',
    access: [A],
    query: ReportRangeQuery,
    status: 200,
    response: OutcomesResponse,
  },
  { method: 'GET', path: '/api/reports/export', access: [A], query: ExportQuery, status: 200 },
  {
    method: 'GET',
    path: '/api/valuation-rates',
    access: [A],
    status: 200,
    response: ValuationRateListResponse,
  },
  {
    method: 'PUT',
    path: '/api/valuation-rates',
    access: [A],
    body: UpdateValuationRatesRequest,
    status: 200,
    response: ValuationRateListResponse,
  },
  {
    method: 'POST',
    path: '/api/tax-certificates',
    access: [A],
    body: IssueCertificateRequest,
    status: 201,
    response: CertificateResponse,
  },
  {
    method: 'GET',
    path: '/api/tax-certificates',
    access: [D, A],
    ownedByOrganisation: true,
    query: ListCertificatesQuery,
    status: 200,
    response: CertificateListResponse,
  },
  {
    method: 'GET',
    path: '/api/tax-certificates/:id/pdf',
    access: [D, A],
    ownedByOrganisation: true,
    status: 200,
  },
  {
    method: 'GET',
    path: '/api/users',
    access: [A],
    query: ListUsersQuery,
    status: 200,
    response: UserListResponse,
  },
  {
    method: 'POST',
    path: '/api/users',
    access: [A],
    body: CreateUserRequest,
    status: 201,
    response: CreateUserResponse,
  },
  {
    method: 'PATCH',
    path: '/api/users/:id',
    access: [A],
    body: UpdateUserRequest,
    status: 200,
    response: UserResponse,
  },
  {
    method: 'GET',
    path: '/api/audit-log',
    access: [A],
    query: AuditLogQuery,
    status: 200,
    response: AuditLogResponse,
  },
] as const satisfies readonly RouteSpec[];

export type Route = (typeof ROUTES)[number];
export type RouteKey = `${Route['method']} ${Route['path']}`;

export function routeKey(r: Pick<RouteSpec, 'method' | 'path'>): string {
  return `${r.method} ${r.path}`;
}
