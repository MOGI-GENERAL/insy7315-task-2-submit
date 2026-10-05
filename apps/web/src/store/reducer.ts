/* REDUCER: ALL ACTIONS FLOW THROUGH HERE. CLAIM_OFFER GUARDS AGAINST DOUBLE-CLAIM */

import type { VerificationDecision } from '@fedsa/contract';
import type {
  AppNotification,
  AppState,
  Claim,
  ColdChain,
  Condition,
  FoodCategory,
  HandoverRecord,
  Language,
  Offer,
  OrganisationStatus,
} from './types';
import { createInitialState } from './seed';
import { nextStatus } from '../lib/org';

let sequence = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(sequence++).toString(36)}`;

export type Action =
  | { type: 'LOGIN'; userId: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_LANGUAGE'; language: Language }
  | { type: 'CLEAR_EVENT' }
  | {
      type: 'POST_OFFER';
      offer: {
        title: string;
        description: string;
        category: FoodCategory;
        offeredQuantityKg: number;
        coldChain: ColdChain;
        photo: string | null;
        availableFrom: string;
        collectionDeadline: string;
      };
      userId: string;
      organisationId: string;
      /** MATCHED ORGS, FOR THE LOG */
      notifiedOrganisationIds: string[];
    }
  | { type: 'CANCEL_OFFER'; offerId: string }
  | { type: 'CLAIM_OFFER'; offerId: string; userId: string; transportNeeded: boolean }
  | { type: 'RELEASE_CLAIM'; claimId: string; reason: string }
  | {
      type: 'CONFIRM_HANDOVER_DONOR';
      claimId: string;
      userId: string;
      quantityKg: number;
      photo: string | null;
    }
  | {
      type: 'CONFIRM_HANDOVER_RECIPIENT';
      claimId: string;
      userId: string;
      condition: Condition;
      note: string;
    }
  | {
      type: 'DISPATCH_DRIVER';
      claimId: string;
      userId: string;
      driverName: string;
      driverPhone: string;
      scheduledFor?: string;
    }
  | {
      type: 'SET_VERIFICATION';
      organisationId: string;
      decision: VerificationDecision;
      userId: string;
    }
  | { type: 'SAVE_CAPACITY_NOTE'; organisationId: string; note: string; userId: string }
  | { type: 'RESOLVE_DISPUTE'; handoverId: string; note: string; userId: string }
  | { type: 'MARK_NOTIFICATION_READ'; notificationId: string }
  | { type: 'MARK_ALL_READ'; userId: string }
  | { type: 'ISSUE_CERTIFICATE'; certificateId: string; userId: string }
  | { type: 'TOGGLE_ACCOUNT'; targetUserId: string; userId: string }
  | { type: 'RESET' };

const nowIso = () => new Date().toISOString();

function notify(partial: Omit<AppNotification, 'id' | 'readAt' | 'createdAt'>): AppNotification {
  return { ...partial, id: uid('ntf'), readAt: null, createdAt: nowIso() };
}

/** ACTIVE COORDINATOR IDS, FOR ALERTS */
function coordinatorIds(state: AppState): string[] {
  return state.users.filter((u) => u.role === 'coordinator' && u.active).map((u) => u.id);
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN': {
      const user = state.users.find((u) => u.id === action.userId);
      if (!user) return state;
      return { ...state, currentUserId: user.id, language: user.language, lastEvent: null };
    }

    case 'LOGOUT':
      return { ...state, currentUserId: null, lastEvent: null };

    case 'SET_LANGUAGE':
      return { ...state, language: action.language };

    case 'CLEAR_EVENT':
      return { ...state, lastEvent: null };

    case 'POST_OFFER': {
      const id = uid('off');
      const reference = `OF-${1100 + state.offers.length}`;
      const offer: Offer = {
        id,
        reference,
        donorOrganisationId: action.organisationId,
        postedByUserId: action.userId,
        title: action.offer.title,
        description: action.offer.description,
        category: action.offer.category,
        offeredQuantityKg: action.offer.offeredQuantityKg,
        coldChain: action.offer.coldChain,
        photo: action.offer.photo,
        availableFrom: action.offer.availableFrom,
        collectionDeadline: action.offer.collectionDeadline,
        status: 'open',
        createdAt: nowIso(),
        expiredAt: null,
        parentOfferId: null,
      };

      const donorOrg = state.organisations.find((o) => o.id === action.organisationId);

      /* FAN-OUT: ONE NOTIFICATION PER CANDIDATE RECIPIENT */
      const fanout: AppNotification[] = action.notifiedOrganisationIds.flatMap((orgId) =>
        state.users
          .filter((u) => u.organisationId === orgId && u.active)
          .map((u) =>
            notify({
              userId: u.id,
              kind: 'offer_posted',
              channel: 'push',
              title: 'New offer near you',
              body: `${action.offer.offeredQuantityKg} kg ${action.offer.category}, ${donorOrg?.suburb ?? ''}. ${donorOrg?.name ?? ''}`,
              href: `/recipient/offers/${id}`,
            }),
          ),
      );

      return {
        ...state,
        offers: [...state.offers, offer],
        notifications: [...fanout, ...state.notifications],
        lastEvent: {
          kind: 'offer-posted',
          id,
          message: `${reference} is live. ${action.notifiedOrganisationIds.length} organisations notified.`,
        },
      };
    }

    case 'CANCEL_OFFER': {
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer || offer.status !== 'open') return state;
      return {
        ...state,
        offers: state.offers.map((o) =>
          o.id === action.offerId ? { ...o, status: 'cancelled' } : o,
        ),
        lastEvent: {
          kind: 'offer-cancelled',
          id: offer.id,
          message: `${offer.reference} cancelled.`,
        },
      };
    }

    /* CLAIM LOCK: CHECKED AGAINST WRITE-TIME STATE, NOT STALE RENDER STATE */
    case 'CLAIM_OFFER': {
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer) return state;

      if (offer.status !== 'open') {
        const holder = state.claims.find((c) => c.offerId === offer.id && c.status === 'active');
        const holderOrg = state.organisations.find((o) => o.id === holder?.recipientOrganisationId);
        return {
          ...state,
          lastEvent: {
            kind: 'claim-rejected',
            id: offer.id,
            message: holderOrg
              ? `${offer.reference} was already claimed by ${holderOrg.name}.`
              : `${offer.reference} is no longer available.`,
          },
        };
      }

      const user = state.users.find((u) => u.id === action.userId);
      if (!user?.organisationId) return state;

      const claimId = uid('clm');
      const claim: Claim = {
        id: claimId,
        offerId: offer.id,
        recipientOrganisationId: user.organisationId,
        claimedByUserId: user.id,
        transportNeeded: action.transportNeeded,
        status: 'active',
        claimedAt: nowIso(),
        releasedAt: null,
        releaseReason: null,
      };

      const recipientOrg = state.organisations.find((o) => o.id === user.organisationId);

      const alerts: AppNotification[] = [
        notify({
          userId: offer.postedByUserId,
          kind: 'offer_claimed',
          channel: 'push',
          title: `${offer.reference} claimed`,
          body: `${recipientOrg?.name ?? 'A recipient'} will collect ${offer.title.toLowerCase()}.`,
          href: `/donor/offers/${offer.id}`,
        }),
      ];

      if (action.transportNeeded) {
        for (const cid of coordinatorIds(state)) {
          alerts.push(
            notify({
              userId: cid,
              kind: 'offer_claimed',
              channel: 'push',
              title: `${offer.reference} needs a driver`,
              body: `${recipientOrg?.name ?? 'A recipient'} claimed ${offer.offeredQuantityKg} kg and has no transport.`,
              href: '/coordinator/dispatch',
            }),
          );
        }
      }

      return {
        ...state,
        offers: state.offers.map((o) => (o.id === offer.id ? { ...o, status: 'claimed' } : o)),
        claims: [...state.claims, claim],
        notifications: [...alerts, ...state.notifications],
        lastEvent: {
          kind: 'claim-made',
          id: claimId,
          message: `${offer.reference} is yours. Collect by ${new Date(offer.collectionDeadline).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}.`,
        },
      };
    }

    /* RELEASE KEEPS HISTORY; OFFER REOPENS IF DEADLINE NOT PASSED */
    case 'RELEASE_CLAIM': {
      const claim = state.claims.find((c) => c.id === action.claimId);
      if (!claim || claim.status !== 'active') return state;
      const offer = state.offers.find((o) => o.id === claim.offerId);
      if (!offer) return state;

      const stillOpen = new Date(offer.collectionDeadline).getTime() > Date.now();
      const org = state.organisations.find((o) => o.id === claim.recipientOrganisationId);

      return {
        ...state,
        claims: state.claims.map((c) =>
          c.id === claim.id
            ? {
                ...c,
                status: 'released',
                releasedAt: nowIso(),
                releaseReason: action.reason || null,
              }
            : c,
        ),
        offers: state.offers.map((o) =>
          o.id === offer.id
            ? {
                ...o,
                status: stillOpen ? 'open' : 'expired',
                expiredAt: stillOpen ? null : nowIso(),
              }
            : o,
        ),
        handovers: state.handovers.filter((h) => h.claimId !== claim.id),
        notifications: [
          notify({
            userId: offer.postedByUserId,
            kind: 'claim_released',
            channel: 'push',
            title: `${offer.reference} released`,
            body: stillOpen
              ? `${org?.name ?? 'The recipient'} can no longer collect. The offer is open again.`
              : `${org?.name ?? 'The recipient'} released the claim after the deadline.`,
            href: `/donor/offers/${offer.id}`,
          }),
          ...state.notifications,
        ],
        lastEvent: {
          kind: 'claim-released',
          id: offer.id,
          message: stillOpen
            ? `${offer.reference} is open again for other organisations.`
            : `${offer.reference} released, but the collection window has closed.`,
        },
      };
    }

    /* RECORD STARTS HERE; A SHORTFALL SPLITS OFF A REMAINDER OFFER */
    case 'CONFIRM_HANDOVER_DONOR': {
      if (state.handovers.some((h) => h.claimId === action.claimId)) return state;
      const claim = state.claims.find((c) => c.id === action.claimId);
      if (!claim || claim.status !== 'active') return state;
      const offer = state.offers.find((o) => o.id === claim.offerId)!;

      const recipientUsers = state.users.filter(
        (u) => u.organisationId === claim.recipientOrganisationId && u.active,
      );

      const handover: HandoverRecord = {
        id: uid('hnd'),
        claimId: claim.id,
        donorConfirmedAt: nowIso(),
        donorConfirmedByUserId: action.userId,
        collectedQuantityKg: action.quantityKg,
        donorPhoto: action.photo,
        recipientConfirmedAt: null,
        recipientConfirmedByUserId: null,
        conditionOnReceipt: null,
        conditionNotes: null,
        resolvedAt: null,
        resolvedByUserId: null,
        resolutionNote: null,
      };

      const remainingKg = Math.round((offer.offeredQuantityKg - action.quantityKg) * 10) / 10;
      const remainder: Offer | null =
        remainingKg > 0 && new Date(offer.collectionDeadline).getTime() > Date.now()
          ? {
              ...offer,
              id: uid('off'),
              reference: `OF-${1100 + state.offers.length}`,
              offeredQuantityKg: remainingKg,
              status: 'open',
              createdAt: nowIso(),
              expiredAt: null,
              parentOfferId: offer.id,
            }
          : null;

      return {
        ...state,
        handovers: [...state.handovers, handover],
        offers: remainder ? [...state.offers, remainder] : state.offers,
        notifications: [
          ...recipientUsers.map((u) =>
            notify({
              userId: u.id,
              kind: 'handover_confirmed',
              channel: 'push',
              title: `${offer.reference}: donor confirmed`,
              body: `${action.quantityKg} kg released. Confirm receipt when it reaches you.`,
              href: `/recipient/handover/${claim.id}`,
            }),
          ),
          ...state.notifications,
        ],
        lastEvent: {
          kind: 'handover-donor',
          id: claim.id,
          message: remainder
            ? `Handover recorded for ${offer.reference}. The ${remainingKg} kg left over is posted again as ${remainder.reference}.`
            : `Handover recorded for ${offer.reference}. Waiting on the recipient.`,
        },
      };
    }

    /* 2ND CONFIRMATION CLOSES RECORD; A PROBLEM CONDITION OPENS A DISPUTE */
    case 'CONFIRM_HANDOVER_RECIPIENT': {
      const handover = state.handovers.find((h) => h.claimId === action.claimId);
      if (!handover || handover.recipientConfirmedAt) return state;
      const claim = state.claims.find((c) => c.id === action.claimId)!;
      const offer = state.offers.find((o) => o.id === claim.offerId)!;

      const problem = action.condition === 'problem';
      const firstFulfilment = !state.claims.some(
        (c) =>
          c.recipientOrganisationId === claim.recipientOrganisationId && c.status === 'fulfilled',
      );

      const alerts: AppNotification[] = [
        notify({
          userId: offer.postedByUserId,
          kind: 'handover_confirmed',
          channel: 'push',
          title: `${offer.reference} collected`,
          body: `Receipt confirmed. The handover record is complete and counts towards your tax certificate.`,
          href: `/donor/offers/${offer.id}`,
        }),
      ];

      if (problem) {
        for (const cid of coordinatorIds(state)) {
          alerts.push(
            notify({
              userId: cid,
              kind: 'dispute',
              channel: 'push',
              title: `Problem reported on ${offer.reference}`,
              body: action.note || 'The recipient reported a problem with the handover.',
              href: '/coordinator/disputes',
            }),
          );
        }
      }

      return {
        ...state,
        handovers: state.handovers.map((h) =>
          h.id === handover.id
            ? {
                ...h,
                recipientConfirmedAt: nowIso(),
                recipientConfirmedByUserId: action.userId,
                conditionOnReceipt: action.condition,
                conditionNotes: action.note || null,
              }
            : h,
        ),
        claims: state.claims.map((c) => (c.id === claim.id ? { ...c, status: 'fulfilled' } : c)),
        organisations: state.organisations.map((o) =>
          o.id === claim.recipientOrganisationId && o.status === 'verified' && firstFulfilment
            ? { ...o, status: 'active' }
            : o,
        ),
        offers: state.offers.map((o) => (o.id === offer.id ? { ...o, status: 'collected' } : o)),
        collections: state.collections.map((c) =>
          c.claimId === claim.id ? { ...c, status: 'completed' } : c,
        ),
        notifications: [...alerts, ...state.notifications],
        lastEvent: {
          kind: 'handover-complete',
          id: claim.id,
          message: problem
            ? `Receipt recorded. A coordinator will look at the problem you reported.`
            : `Receipt recorded. ${offer.reference} is complete.`,
        },
      };
    }

    case 'DISPATCH_DRIVER': {
      const claim = state.claims.find((c) => c.id === action.claimId);
      if (!claim) return state;
      const offer = state.offers.find((o) => o.id === claim.offerId)!;
      const existing = state.collections.find((c) => c.claimId === claim.id);

      const collection = {
        id: existing?.id ?? uid('col'),
        claimId: claim.id,
        dispatchedByUserId: action.userId,
        driverName: action.driverName,
        driverPhone: action.driverPhone,
        dispatchedAt: nowIso(),
        scheduledFor: action.scheduledFor ?? null,
        status: 'dispatched' as const,
      };

      return {
        ...state,
        collections: existing
          ? state.collections.map((c) => (c.id === existing.id ? collection : c))
          : [...state.collections, collection],
        lastEvent: {
          kind: 'driver-dispatched',
          id: claim.id,
          message: `${action.driverName} sent the details for ${offer.reference} by SMS.`,
        },
      };
    }

    case 'SET_VERIFICATION': {
      const org = state.organisations.find((o) => o.id === action.organisationId);
      if (!org || org.type !== 'recipient') return state;
      const fulfilled = state.claims.some(
        (c) => c.recipientOrganisationId === org.id && c.status === 'fulfilled',
      );
      const status = nextStatus(org.status, action.decision, fulfilled);
      if (!status) return state;
      const label: Record<OrganisationStatus, string> = {
        pending: 'returned to pending',
        verified: 'verified and approved',
        rejected: 'rejected',
        active: 'reinstated',
        suspended: 'suspended',
      };
      return {
        ...state,
        organisations: state.organisations.map((o) => (o.id === org.id ? { ...o, status } : o)),
        audit: [
          {
            id: uid('aud'),
            actorUserId: action.userId,
            action: `Organisation ${label[status]}`,
            target: org.name,
            detail: `Verification moved from ${org.status} to ${status}.`,
            at: nowIso(),
          },
          ...state.audit,
        ],
        lastEvent: {
          kind: 'verification',
          id: org.id,
          message: `${org.name} ${label[status]}.`,
        },
      };
    }

    case 'SAVE_CAPACITY_NOTE': {
      const org = state.organisations.find((o) => o.id === action.organisationId);
      if (!org) return state;
      return {
        ...state,
        organisations: state.organisations.map((o) =>
          o.id === org.id ? { ...o, capacityNotes: action.note } : o,
        ),
        audit: [
          {
            id: uid('aud'),
            actorUserId: action.userId,
            action: 'Updated capacity notes',
            target: org.name,
            detail: 'Matching knowledge recorded against the organisation.',
            at: nowIso(),
          },
          ...state.audit,
        ],
        lastEvent: { kind: 'note-saved', id: org.id, message: `Notes saved for ${org.name}.` },
      };
    }

    /* RESOLUTION IS WRITE-ONCE AND LEAVES THE HANDOVER FIGURES AS RECORDED */
    case 'RESOLVE_DISPUTE': {
      const handover = state.handovers.find((h) => h.id === action.handoverId);
      if (!handover || handover.conditionOnReceipt !== 'problem' || handover.resolvedAt)
        return state;
      if (!action.note) return state;
      const claim = state.claims.find((c) => c.id === handover.claimId);
      const offer = claim && state.offers.find((o) => o.id === claim.offerId);
      const reference = offer?.reference ?? handover.claimId;

      return {
        ...state,
        handovers: state.handovers.map((h) =>
          h.id === handover.id
            ? {
                ...h,
                resolvedAt: nowIso(),
                resolvedByUserId: action.userId,
                resolutionNote: action.note,
              }
            : h,
        ),
        audit: [
          {
            id: uid('aud'),
            actorUserId: action.userId,
            action: 'Resolved dispute',
            target: reference,
            detail: action.note,
            at: nowIso(),
          },
          ...state.audit,
        ],
        lastEvent: {
          kind: 'dispute-resolved',
          id: handover.id,
          message: `Dispute on ${reference} closed with your note.`,
        },
      };
    }

    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.notificationId && !n.readAt ? { ...n, readAt: nowIso() } : n,
        ),
      };

    case 'MARK_ALL_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.userId === action.userId && !n.readAt ? { ...n, readAt: nowIso() } : n,
        ),
      };

    case 'ISSUE_CERTIFICATE': {
      const cert = state.certificates.find((c) => c.id === action.certificateId);
      if (!cert || cert.status === 'issued') return state;
      const org = state.organisations.find((o) => o.id === cert.donorOrganisationId);
      const donorUsers = state.users.filter(
        (u) => u.organisationId === cert.donorOrganisationId && u.active,
      );

      return {
        ...state,
        certificates: state.certificates.map((c) =>
          c.id === cert.id ? { ...c, status: 'issued', issuedAt: nowIso() } : c,
        ),
        notifications: [
          ...donorUsers.map((u) =>
            notify({
              userId: u.id,
              kind: 'handover_confirmed',
              channel: 'push',
              title: `Tax certificate ${cert.reference} issued`,
              body: `${Math.round(cert.totalKg)} kg donated, ${cert.mealEquivalents.toLocaleString('en-ZA')} meal equivalents.`,
              href: '/donor/certificates',
            }),
          ),
          ...state.notifications,
        ],
        audit: [
          {
            id: uid('aud'),
            actorUserId: action.userId,
            action: 'Issued tax certificate',
            target: `${cert.reference}, ${org?.name ?? ''}`,
            detail: `Built from ${cert.handoverRecordIds.length} handover records.`,
            at: nowIso(),
          },
          ...state.audit,
        ],
        lastEvent: {
          kind: 'certificate-issued',
          id: cert.id,
          message: `${cert.reference} issued to ${org?.name ?? 'the donor'}.`,
        },
      };
    }

    case 'TOGGLE_ACCOUNT': {
      const target = state.users.find((u) => u.id === action.targetUserId);
      if (!target) return state;
      const nowActive = !target.active;
      return {
        ...state,
        users: state.users.map((u) => (u.id === target.id ? { ...u, active: nowActive } : u)),
        audit: [
          {
            id: uid('aud'),
            actorUserId: action.userId,
            action: nowActive ? 'Enabled account' : 'Disabled account',
            target: target.name,
            detail: nowActive
              ? 'Access restored.'
              : 'Access removed. A departed account is the insider risk the register names.',
            at: nowIso(),
          },
          ...state.audit,
        ],
        lastEvent: {
          kind: 'account-toggled',
          id: target.id,
          message: `${target.name} ${nowActive ? 'enabled' : 'disabled'}.`,
        },
      };
    }

    /* RESETS DEMO WITHOUT A PAGE RELOAD */
    case 'RESET': {
      const fresh = createInitialState();
      return { ...fresh, currentUserId: state.currentUserId, language: state.language };
    }

    default:
      return state;
  }
}
