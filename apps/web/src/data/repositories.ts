import type {
  AuditLogQuery,
  AuditLogResponse,
  CancelOfferRequest,
  CapacityNotesRequest,
  CertificateListResponse,
  CertificateResponse,
  ChangePasswordRequest,
  ClaimListResponse,
  ClaimRequest,
  ClaimResponse,
  ClaimWithOfferResponse,
  CollectionResponse,
  CreateUserRequest,
  CreateUserResponse,
  DispatchRequest,
  DonorConfirmFields,
  DonorConfirmResponse,
  HandoverListResponse,
  HandoverResponse,
  ImpactQuery,
  ImpactResponse,
  IssueCertificateRequest,
  ListCertificatesQuery,
  ListClaimsQuery,
  ListHandoversQuery,
  ListOffersQuery,
  ListOrganisationsQuery,
  ListUsersQuery,
  LoginRequest,
  NotificationListResponse,
  OfferDetailResponse,
  OfferListResponse,
  OfferResponse,
  OrganisationDetailResponse,
  OrganisationListResponse,
  OrganisationResponse,
  OutcomesResponse,
  PostOfferFields,
  PostOfferResponse,
  RecipientConfirmRequest,
  RecipientConfirmResponse,
  RegisterRequest,
  ReleaseClaimRequest,
  ReportRangeQuery,
  ResolutionRequest,
  SessionResponse,
  UpdateCollectionRequest,
  UpdateDonorOrganisationRequest,
  UpdateMeRequest,
  UpdateRecipientOrganisationRequest,
  UpdateUserRequest,
  UpdateValuationRatesRequest,
  UserListResponse,
  UserResponse,
  ValuationRateListResponse,
  VerificationRequest,
} from '@fedsa/contract';

/*
 * one interface per resource, one method per endpoint. screens import these, never the store.
 * the fake and HTTP implementations are interchangeable behind them
 */

export interface AuthRepository {
  register(body: RegisterRequest): Promise<SessionResponse>;
  login(body: LoginRequest): Promise<SessionResponse>;
  logout(): Promise<void>;
  /** null when nobody is signed in */
  me(): Promise<SessionResponse | null>;
  updateMe(body: UpdateMeRequest): Promise<UserResponse>;
  changePassword(body: ChangePasswordRequest): Promise<void>;
}

export interface OrganisationsRepository {
  mine(): Promise<OrganisationResponse>;
  updateMine(
    body: UpdateDonorOrganisationRequest | UpdateRecipientOrganisationRequest,
  ): Promise<OrganisationResponse>;
  list(query: ListOrganisationsQuery): Promise<OrganisationListResponse>;
  get(id: string): Promise<OrganisationDetailResponse>;
  decide(id: string, body: VerificationRequest): Promise<OrganisationResponse>;
  saveNotes(id: string, body: CapacityNotesRequest): Promise<OrganisationResponse>;
}

export interface OffersRepository {
  list(query: ListOffersQuery): Promise<OfferListResponse>;
  get(id: string): Promise<OfferDetailResponse>;
  /** the key makes a retried post return the first offer instead of a second one */
  post(fields: PostOfferFields, photos: File[], idempotencyKey: string): Promise<PostOfferResponse>;
  cancel(id: string, body: CancelOfferRequest): Promise<OfferResponse>;
  claim(id: string, body: ClaimRequest): Promise<ClaimResponse>;
}

export interface ClaimsRepository {
  list(query: ListClaimsQuery): Promise<ClaimListResponse>;
  release(id: string, body: ReleaseClaimRequest): Promise<ClaimWithOfferResponse>;
  dispatch(id: string, body: DispatchRequest): Promise<CollectionResponse>;
  updateCollection(id: string, body: UpdateCollectionRequest): Promise<CollectionResponse>;
}

export interface HandoversRepository {
  donorConfirm(
    offerId: string,
    fields: DonorConfirmFields,
    photo: File | null,
  ): Promise<DonorConfirmResponse>;
  recipientConfirm(
    offerId: string,
    body: RecipientConfirmRequest,
  ): Promise<RecipientConfirmResponse>;
  list(query: ListHandoversQuery): Promise<HandoverListResponse>;
  resolve(id: string, body: ResolutionRequest): Promise<HandoverResponse>;
}

export interface NotificationsRepository {
  list(): Promise<NotificationListResponse>;
  markRead(id: string): Promise<void>;
}

export interface ReportsRepository {
  impact(query: ImpactQuery): Promise<ImpactResponse>;
  outcomes(query: ReportRangeQuery): Promise<OutcomesResponse>;
}

export interface CertificatesRepository {
  list(query: ListCertificatesQuery): Promise<CertificateListResponse>;
  issue(body: IssueCertificateRequest): Promise<CertificateResponse>;
  rates(): Promise<ValuationRateListResponse>;
  updateRates(body: UpdateValuationRatesRequest): Promise<ValuationRateListResponse>;
}

export interface UsersRepository {
  list(query: ListUsersQuery): Promise<UserListResponse>;
  create(body: CreateUserRequest): Promise<CreateUserResponse>;
  update(id: string, body: UpdateUserRequest): Promise<UserResponse>;
  auditLog(query: AuditLogQuery): Promise<AuditLogResponse>;
}

export interface DataLayer {
  auth: AuthRepository;
  organisations: OrganisationsRepository;
  offers: OffersRepository;
  claims: ClaimsRepository;
  handovers: HandoversRepository;
  notifications: NotificationsRepository;
  reports: ReportsRepository;
  certificates: CertificatesRepository;
  users: UsersRepository;
}
