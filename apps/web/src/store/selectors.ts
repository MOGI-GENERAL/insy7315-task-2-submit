/* READ-ONLY DERIVED VIEWS: REPORTS COMPUTED FROM THE SAME OPERATIONAL RECORDS */

import type { AppState, Claim, HandoverRecord, Offer, Organisation, User } from './types';
import { KG_PER_MEAL } from '../lib/format';
import { canStore } from '../lib/org';

/* LOOKUPS */

export const orgById = (state: AppState, id: string | null | undefined) =>
  state.organisations.find((o) => o.id === id);

export const userById = (state: AppState, id: string | null | undefined) =>
  state.users.find((u) => u.id === id);

export const offerById = (state: AppState, id: string | null | undefined) =>
  state.offers.find((o) => o.id === id);

export const claimById = (state: AppState, id: string | null | undefined) =>
  state.claims.find((c) => c.id === id);

export const handoverForClaim = (state: AppState, claimId: string) =>
  state.handovers.find((h) => h.claimId === claimId);

export const collectionForClaim = (state: AppState, claimId: string) =>
  state.collections.find((c) => c.claimId === claimId);

/** the offer's current claim, active or already fulfilled */
export const activeClaimForOffer = (state: AppState, offerId: string) =>
  state.claims.find(
    (c) => c.offerId === offerId && (c.status === 'active' || c.status === 'fulfilled'),
  );

export const currentUser = (state: AppState) => userById(state, state.currentUserId) ?? null;

export const currentOrg = (state: AppState) => {
  const user = currentUser(state);
  return user ? (orgById(state, user.organisationId) ?? null) : null;
};

/* ELIGIBILITY */

export interface Eligibility {
  eligible: boolean;
  /** WITHHELD REASONS, USER-FACING */
  reasons: string[];
  /** NEEDS A DRIVER */
  transportNeeded: boolean;
}

/* STORAGE/CAPACITY ARE HARD FILTERS; TRANSPORT IS NOT (FAIRNESS REQUIREMENT) */
export function checkEligibility(
  org: Organisation,
  /** PARTIAL OFFER, FOR LIVE FORM VALIDATION */
  offer: Pick<Offer, 'coldChain' | 'offeredQuantityKg'>,
): Eligibility {
  const reasons: string[] = [];
  // an empty capacity means no limit, as it does in the API
  const capacity = org.maxCapacityKg;

  if (!canStore(org, offer.coldChain)) {
    reasons.push(
      offer.coldChain === 'refrigerated'
        ? 'Needs refrigeration, and your profile has no fridge'
        : offer.coldChain === 'frozen'
          ? 'Needs freezing, and your profile has no freezer'
          : 'Storage conditions do not match your profile',
    );
  }

  if (capacity != null && offer.offeredQuantityKg > capacity) {
    reasons.push(`${offer.offeredQuantityKg} kg is more than your ${capacity} kg limit`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    transportNeeded: !org.hasTransport,
  };
}

const isLive = (offer: Offer) =>
  offer.status === 'open' && new Date(offer.collectionDeadline).getTime() > Date.now();

/** ELIGIBLE, COLLECTABLE TODAY */
export function eligibleOffers(state: AppState, org: Organisation): Offer[] {
  return state.offers
    .filter(isLive)
    .filter((o) => new Date(o.availableFrom).getTime() <= Date.now())
    .filter((o) => checkEligibility(org, o).eligible)
    .sort(
      (a, b) => new Date(a.collectionDeadline).getTime() - new Date(b.collectionDeadline).getTime(),
    );
}

/** ELIGIBLE, LATER DAY */
export function scheduledOffers(state: AppState, org: Organisation): Offer[] {
  return state.offers
    .filter(isLive)
    .filter((o) => new Date(o.availableFrom).getTime() > Date.now())
    .filter((o) => checkEligibility(org, o).eligible)
    .sort((a, b) => new Date(a.availableFrom).getTime() - new Date(b.availableFrom).getTime());
}

/** WITHHELD OFFERS, REASON SHOWN NOT HIDDEN */
export function withheldOffers(
  state: AppState,
  org: Organisation,
): { offer: Offer; reasons: string[] }[] {
  return state.offers
    .filter(isLive)
    .map((offer) => ({ offer, ...checkEligibility(org, offer) }))
    .filter((x) => !x.eligible)
    .map(({ offer, reasons }) => ({ offer, reasons }));
}

/* BY ROLE */

export function offersForDonor(state: AppState, organisationId: string): Offer[] {
  return state.offers
    .filter((o) => o.donorOrganisationId === organisationId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export interface ClaimView {
  claim: Claim;
  offer: Offer;
  handover: HandoverRecord | undefined;
  donorOrg: Organisation | undefined;
  recipientOrg: Organisation | undefined;
  /** CLAIM STAGE, USER-FACING WORDING */
  stage:
    | 'awaiting-collection'
    | 'awaiting-your-confirmation'
    | 'awaiting-other-party'
    | 'complete'
    | 'released'
    | 'expired';
}

function stageOf(claim: Claim, handover: HandoverRecord | undefined, side: 'donor' | 'recipient') {
  if (claim.status === 'released') return 'released' as const;
  if (claim.status === 'expired') return 'expired' as const;
  if (!handover) return 'awaiting-collection' as const;
  const mine = side === 'donor' ? handover.donorConfirmedAt : handover.recipientConfirmedAt;
  const theirs = side === 'donor' ? handover.recipientConfirmedAt : handover.donorConfirmedAt;
  if (mine && theirs) return 'complete' as const;
  if (!mine) return 'awaiting-your-confirmation' as const;
  return 'awaiting-other-party' as const;
}

export function claimsForRecipient(state: AppState, organisationId: string): ClaimView[] {
  return state.claims
    .filter((c) => c.recipientOrganisationId === organisationId)
    .map((claim) => {
      const offer = offerById(state, claim.offerId)!;
      const handover = handoverForClaim(state, claim.id);
      return {
        claim,
        offer,
        handover,
        donorOrg: orgById(state, offer.donorOrganisationId),
        recipientOrg: orgById(state, organisationId),
        stage: stageOf(claim, handover, 'recipient'),
      };
    })
    .filter((v) => Boolean(v.offer))
    .sort((a, b) => new Date(b.claim.claimedAt).getTime() - new Date(a.claim.claimedAt).getTime());
}

export function claimsForDonor(state: AppState, organisationId: string): ClaimView[] {
  const offerIds = new Set(
    state.offers.filter((o) => o.donorOrganisationId === organisationId).map((o) => o.id),
  );
  return state.claims
    .filter((c) => offerIds.has(c.offerId))
    .map((claim) => {
      const offer = offerById(state, claim.offerId)!;
      const handover = handoverForClaim(state, claim.id);
      return {
        claim,
        offer,
        handover,
        donorOrg: orgById(state, organisationId),
        recipientOrg: orgById(state, claim.recipientOrganisationId),
        stage: stageOf(claim, handover, 'donor'),
      };
    })
    .sort((a, b) => new Date(b.claim.claimedAt).getTime() - new Date(a.claim.claimedAt).getTime());
}

/** NEEDS DRIVER, NOT DISPATCHED */
export function awaitingDispatch(state: AppState): ClaimView[] {
  return state.claims
    .filter((c) => c.transportNeeded && c.status === 'active')
    .filter((c) => {
      const offer = offerById(state, c.offerId);
      return offer?.status === 'claimed';
    })
    .map((claim) => {
      const offer = offerById(state, claim.offerId)!;
      return {
        claim,
        offer,
        handover: handoverForClaim(state, claim.id),
        donorOrg: orgById(state, offer.donorOrganisationId),
        recipientOrg: orgById(state, claim.recipientOrganisationId),
        stage: 'awaiting-collection' as const,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.offer.collectionDeadline).getTime() -
        new Date(b.offer.collectionDeadline).getTime(),
    );
}

export function notificationsFor(state: AppState, userId: string) {
  return state.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function unreadCount(state: AppState, userId: string) {
  return state.notifications.filter((n) => n.userId === userId && !n.readAt).length;
}

/* DASHBOARD */

export interface DashboardView {
  open: Offer[];
  claimed: Offer[];
  expiringSoon: Offer[];
  collectedToday: Offer[];
  expiredToday: Offer[];
  needsDriver: ClaimView[];
  openDisputes: HandoverRecord[];
  pendingVerification: Organisation[];
}

export function dashboard(state: AppState): DashboardView {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const live = state.offers.filter(isLive);

  const collectedToday = state.offers.filter((o) => {
    if (o.status !== 'collected') return false;
    const claim = activeClaimForOffer(state, o.id);
    const handover = claim && handoverForClaim(state, claim.id);
    const at = handover?.recipientConfirmedAt;
    return Boolean(at && new Date(at).getTime() >= dayStart);
  });

  return {
    open: live,
    claimed: state.offers.filter((o) => o.status === 'claimed'),
    expiringSoon: live.filter(
      (o) => new Date(o.collectionDeadline).getTime() - now <= 2 * 60 * 60 * 1000,
    ),
    collectedToday,
    expiredToday: state.offers.filter(
      (o) => o.status === 'expired' && o.expiredAt && new Date(o.expiredAt).getTime() >= dayStart,
    ),
    needsDriver: awaitingDispatch(state).filter((v) => !collectionForClaim(state, v.claim.id)),
    openDisputes: state.handovers.filter(isOpenDispute),
    pendingVerification: state.organisations.filter(
      (o) => o.type === 'recipient' && o.status === 'pending',
    ),
  };
}

/* REPORTS */

/** BOTH PARTIES CONFIRMED = FOOD MOVED */
export function completedHandovers(state: AppState): HandoverRecord[] {
  return state.handovers.filter((h) => h.donorConfirmedAt && h.recipientConfirmedAt);
}

export interface MonthRow {
  key: string;
  label: string;
  kg: number;
  meals: number;
  offersPosted: number;
  collected: number;
  expired: number;
}

const monthKey = (iso: string) => iso.slice(0, 7);

export function byMonth(state: AppState, months = 6): MonthRow[] {
  const rows = new Map<string, MonthRow>();

  const ensure = (key: string): MonthRow => {
    let row = rows.get(key);
    if (!row) {
      const [y, m] = key.split('-').map(Number);
      row = {
        key,
        label: new Date(y, m - 1, 1).toLocaleDateString('en-ZA', {
          month: 'short',
          year: 'numeric',
        }),
        kg: 0,
        meals: 0,
        offersPosted: 0,
        collected: 0,
        expired: 0,
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const offer of state.offers) {
    const row = ensure(monthKey(offer.createdAt));
    row.offersPosted += 1;
    if (offer.status === 'collected') row.collected += 1;
    if (offer.status === 'expired') row.expired += 1;
  }

  for (const handover of completedHandovers(state)) {
    const claim = claimById(state, handover.claimId);
    if (!claim) continue;
    const row = ensure(monthKey(handover.recipientConfirmedAt!));
    const kg = handover.collectedQuantityKg;
    row.kg += kg;
  }

  for (const row of rows.values()) row.meals = Math.round(row.kg / KG_PER_MEAL);

  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-months);
}

export interface PartyRow {
  organisationId: string;
  name: string;
  suburb: string;
  kg: number;
  meals: number;
  count: number;
}

export function byDonor(state: AppState): PartyRow[] {
  const rows = new Map<string, PartyRow>();
  for (const handover of completedHandovers(state)) {
    const claim = claimById(state, handover.claimId);
    const offer = claim && offerById(state, claim.offerId);
    if (!offer) continue;
    const org = orgById(state, offer.donorOrganisationId);
    if (!org) continue;
    const row = rows.get(org.id) ?? {
      organisationId: org.id,
      name: org.name,
      suburb: org.suburb,
      kg: 0,
      meals: 0,
      count: 0,
    };
    row.kg += handover.collectedQuantityKg;
    row.count += 1;
    rows.set(org.id, row);
  }
  for (const row of rows.values()) row.meals = Math.round(row.kg / KG_PER_MEAL);
  return [...rows.values()].sort((a, b) => b.kg - a.kg);
}

export function byRecipient(state: AppState): PartyRow[] {
  const rows = new Map<string, PartyRow>();
  for (const handover of completedHandovers(state)) {
    const claim = claimById(state, handover.claimId);
    if (!claim) continue;
    const org = orgById(state, claim.recipientOrganisationId);
    if (!org) continue;
    const row = rows.get(org.id) ?? {
      organisationId: org.id,
      name: org.name,
      suburb: org.suburb,
      kg: 0,
      meals: 0,
      count: 0,
    };
    row.kg += handover.collectedQuantityKg;
    row.count += 1;
    rows.set(org.id, row);
  }
  for (const row of rows.values()) row.meals = Math.round(row.kg / KG_PER_MEAL);
  return [...rows.values()].sort((a, b) => b.kg - a.kg);
}

export interface Headline {
  totalKg: number;
  totalMeals: number;
  thisMonthKg: number;
  thisMonthMeals: number;
  collected: number;
  expired: number;
  claimRate: number;
  distinctRecipients: number;
  activeDonors: number;
  medianMinutesToClaim: number | null;
}

export function headline(state: AppState): Headline {
  const handovers = completedHandovers(state);
  const totalKg = handovers.reduce((sum, h) => sum + h.collectedQuantityKg, 0);

  const thisMonth = monthKey(new Date().toISOString());
  const thisMonthKg = handovers
    .filter((h) => monthKey(h.recipientConfirmedAt!) === thisMonth)
    .reduce((sum, h) => sum + h.collectedQuantityKg, 0);

  const settled = state.offers.filter((o) => o.status === 'collected' || o.status === 'expired');
  const collected = settled.filter((o) => o.status === 'collected').length;
  const expired = settled.filter((o) => o.status === 'expired').length;

  const distinctRecipients = new Set(
    handovers
      .map((h) => claimById(state, h.claimId)?.recipientOrganisationId)
      .filter(Boolean) as string[],
  ).size;

  const activeDonors = new Set(
    handovers
      .map((h) => {
        const claim = claimById(state, h.claimId);
        return claim && offerById(state, claim.offerId)?.donorOrganisationId;
      })
      .filter(Boolean) as string[],
  ).size;

  const gaps = state.claims
    .map((c) => {
      const offer = offerById(state, c.offerId);
      if (!offer) return null;
      return (new Date(c.claimedAt).getTime() - new Date(offer.createdAt).getTime()) / 60_000;
    })
    .filter((n): n is number => n !== null && n >= 0)
    .sort((a, b) => a - b);

  const medianMinutesToClaim =
    gaps.length === 0 ? null : Math.round(gaps[Math.floor(gaps.length / 2)]);

  return {
    totalKg,
    totalMeals: Math.round(totalKg / KG_PER_MEAL),
    thisMonthKg,
    thisMonthMeals: Math.round(thisMonthKg / KG_PER_MEAL),
    collected,
    expired,
    claimRate: settled.length === 0 ? 0 : collected / settled.length,
    distinctRecipients,
    activeDonors,
    medianMinutesToClaim,
  };
}

/* DISPUTES: A HANDOVER THE RECIPIENT MARKED AS A PROBLEM */

export const isDispute = (h: HandoverRecord) => h.conditionOnReceipt === 'problem';
export const isOpenDispute = (h: HandoverRecord) => isDispute(h) && !h.resolvedAt;

export interface DisputeView {
  handover: HandoverRecord;
  claim: Claim | undefined;
  offer: Offer | undefined;
  donorOrg: Organisation | undefined;
  recipientOrg: Organisation | undefined;
  donorUser: User | undefined;
  recipientUser: User | undefined;
}

export function disputeViews(state: AppState): DisputeView[] {
  return state.handovers
    .filter(isDispute)
    .map((handover) => {
      const claim = claimById(state, handover.claimId);
      const offer = claim && offerById(state, claim.offerId);
      return {
        handover,
        claim,
        offer,
        donorOrg: orgById(state, offer?.donorOrganisationId),
        recipientOrg: orgById(state, claim?.recipientOrganisationId),
        donorUser: userById(state, handover.donorConfirmedByUserId),
        recipientUser: userById(state, handover.recipientConfirmedByUserId),
      };
    })
    .sort((a, b) => {
      const aOpen = !a.handover.resolvedAt;
      const bOpen = !b.handover.resolvedAt;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return (
        new Date(a.handover.recipientConfirmedAt!).getTime() -
        new Date(b.handover.recipientConfirmedAt!).getTime()
      );
    });
}

/* CERTIFICATES */

export function certificatesForDonor(state: AppState, organisationId: string) {
  return state.certificates
    .filter((c) => c.donorOrganisationId === organisationId)
    .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
}
