import { KG_PER_MEAL, type ImpactRow, type ListOffersQuery } from '@fedsa/contract';
import { canClaim, nextStatus, storageFields } from '../../lib/org';
import {
  activeClaimForOffer,
  checkEligibility,
  claimsForRecipient,
  collectionForClaim,
  completedHandovers,
  currentOrg,
  currentUser,
  eligibleOffers,
  handoverForClaim,
  isDispute,
  offerById,
  offersForDonor,
  orgById,
  scheduledOffers,
} from '../../store/selectors';
import type { Store } from '../../store/store';
import type { AppState, Offer, Organisation, User } from '../../store/types';
import { ApiError } from '../ApiError';
import type { DataLayer } from '../repositories';
import {
  fakeEmail,
  toAuditEntry,
  toCertificate,
  toClaim,
  toCollection,
  toHandover,
  toNotification,
  toOffer,
  toOrganisation,
  toUser,
} from './mappers';

export interface FakeOptions {
  /** milliseconds before each call settles, long enough to see the loading states */
  delayMs: number;
  /** method names that reject with `INTERNAL`, as `claim` or `offers.claim` */
  failOn: ReadonlySet<string>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-fake${(++sequence).toString(36)}`;

const notFound = () => new ApiError('NOT_FOUND', 'Not found.');
const invalidState = (message: string) => new ApiError('INVALID_STATE', message);

/** calendar day in South African time */
const saDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
const inRange = (iso: string, from?: string, to?: string) => {
  const day = saDay(iso);
  return (!from || day >= from) && (!to || day <= to);
};

const isStaff = (user: User) => user.role === 'coordinator' || user.role === 'administrator';

/** recipients a new offer would reach, by the same rule the feed uses */
function eligibleRecipientIds(
  state: AppState,
  offer: Pick<Offer, 'coldChain' | 'offeredQuantityKg'>,
) {
  return state.organisations
    .filter((o) => o.type === 'recipient' && canClaim(o) && checkEligibility(o, offer).eligible)
    .map((o) => o.id);
}

export function createFakeDataLayer(store: Store, options: FakeOptions): DataLayer {
  const state = () => store.getState();
  const idempotency = new Map<string, string>();
  let rates = (['bakery', 'produce', 'dairy', 'prepared', 'dry', 'other'] as const).map(
    (category, i) => ({
      category,
      ratePerKg: [22, 14, 38, 45, 26, 20][i],
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedByUserId: null as string | null,
    }),
  );

  function call<T>(resource: string, method: string, fn: () => T): Promise<T> {
    return sleep(options.delayMs).then(() => {
      if (options.failOn.has(method) || options.failOn.has(`${resource}.${method}`)) {
        throw new ApiError('INTERNAL', 'Something went wrong on our side. Please try again.');
      }
      return fn();
    });
  }

  function me(): User {
    const user = currentUser(state());
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
    return user;
  }

  function myOrg(): Organisation {
    me();
    const org = currentOrg(state());
    if (!org) throw new ApiError('FORBIDDEN', 'You do not have access to this.');
    return org;
  }

  function sessionResponse() {
    const user = me();
    const org = currentOrg(state());
    return { user: toUser(user, state()), organisation: org ? toOrganisation(org, false) : null };
  }

  function offerDetail(offer: Offer) {
    const s = state();
    const claim = activeClaimForOffer(s, offer.id) ?? null;
    const collection = claim ? (collectionForClaim(s, claim.id) ?? null) : null;
    const handover = claim ? (handoverForClaim(s, claim.id) ?? null) : null;
    return {
      offer: toOffer(offer, s, true),
      claim: claim && toClaim(claim, s),
      collection: collection && toCollection(collection),
      handover: handover && toHandover(handover, s),
    };
  }

  function listOffers(query: ListOffersQuery): Offer[] {
    const s = state();
    const user = me();
    switch (query.view) {
      case 'feed': {
        const org = myOrg();
        return canClaim(org) ? eligibleOffers(s, org) : [];
      }
      case 'scheduled':
        return scheduledOffers(s, myOrg());
      case 'mine':
        return offersForDonor(s, myOrg().id);
      case 'all':
        if (!isStaff(user)) throw new ApiError('FORBIDDEN', 'You do not have access to this.');
        return [...s.offers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }

  return {
    auth: {
      register: (body) =>
        call('auth', 'register', () => {
          const s = state();
          if (s.users.some((u) => fakeEmail(u) === body.user.email)) {
            throw new ApiError('VALIDATION_FAILED', 'Some fields need attention.', {
              'user.email': 'An account with this email already exists',
            });
          }
          store.dispatch({
            type: 'FAKE_REGISTER',
            request: body,
            organisationId: nextId('org'),
            userId: nextId('usr'),
          });
          return sessionResponse();
        }),
      login: (body) =>
        call('auth', 'login', () => {
          const user = state().users.find((u) => fakeEmail(u) === body.email.toLowerCase());
          if (!user || !user.active || body.password.length === 0) {
            throw new ApiError('UNAUTHENTICATED', 'The email or password is not right.');
          }
          store.dispatch({ type: 'LOGIN', userId: user.id });
          return sessionResponse();
        }),
      logout: () => call('auth', 'logout', () => store.dispatch({ type: 'LOGOUT' })),
      me: () => call('auth', 'me', () => (currentUser(state()) ? sessionResponse() : null)),
      updateMe: (body) =>
        call('auth', 'updateMe', () => {
          if (body.languagePreference) {
            store.dispatch({ type: 'SET_LANGUAGE', language: body.languagePreference });
          }
          return { user: toUser(me(), state()) };
        }),
      changePassword: () => call('auth', 'changePassword', () => void me()),
    },

    organisations: {
      mine: () =>
        call('organisations', 'mine', () => ({ organisation: toOrganisation(myOrg(), false) })),
      updateMine: (body) =>
        call('organisations', 'updateMine', () => {
          const org = myOrg();
          const { storageAmbient, storageRefrigerated, storageFrozen, ...rest } = body as Record<
            string,
            unknown
          >;
          const storage =
            org.type === 'recipient' && storageAmbient !== undefined
              ? storageFields(
                  (['ambient', 'refrigerated', 'frozen'] as const).filter(
                    (_, i) => [storageAmbient, storageRefrigerated, storageFrozen][i],
                  ),
                )
              : {};
          store.dispatch({
            type: 'FAKE_UPDATE_ORGANISATION',
            organisationId: org.id,
            changes: { ...(rest as Partial<Organisation>), ...storage },
          });
          return { organisation: toOrganisation(orgById(state(), org.id)!, false) };
        }),
      list: (query) =>
        call('organisations', 'list', () => {
          const q = query.q?.toLowerCase();
          const items = state()
            .organisations.filter((o) => !query.type || o.type === query.type)
            .filter((o) => !query.status || o.status === query.status)
            .filter((o) => !q || o.name.toLowerCase().includes(q))
            .map((o) => toOrganisation(o, true));
          return { items, total: items.length };
        }),
      get: (id) =>
        call('organisations', 'get', () => {
          const s = state();
          const org = orgById(s, id);
          if (!org) throw notFound();
          const claims = s.claims.filter((c) => c.recipientOrganisationId === id);
          return {
            organisation: toOrganisation(org, true),
            stats: {
              offersPosted: s.offers.filter((o) => o.donorOrganisationId === id).length,
              claimsMade: claims.length,
              claimsReleased: claims.filter((c) => c.status === 'released').length,
              kgCollected: completedHandovers(s)
                .filter((h) => claims.some((c) => c.id === h.claimId))
                .reduce((sum, h) => sum + h.collectedQuantityKg, 0),
            },
          };
        }),
      decide: (id, body) =>
        call('organisations', 'decide', () => {
          const s = state();
          const org = orgById(s, id);
          if (!org) throw notFound();
          const fulfilled = s.claims.some(
            (c) => c.recipientOrganisationId === id && c.status === 'fulfilled',
          );
          if (org.type !== 'recipient' || !nextStatus(org.status, body.decision, fulfilled)) {
            throw invalidState(
              `An organisation that is ${org.status} cannot be given that decision.`,
            );
          }
          store.dispatch({
            type: 'SET_VERIFICATION',
            organisationId: id,
            decision: body.decision,
            userId: me().id,
          });
          return { organisation: toOrganisation(orgById(state(), id)!, true) };
        }),
      saveNotes: (id, body) =>
        call('organisations', 'saveNotes', () => {
          if (!orgById(state(), id)) throw notFound();
          store.dispatch({
            type: 'SAVE_CAPACITY_NOTE',
            organisationId: id,
            note: body.capacityNotes,
            userId: me().id,
          });
          return { organisation: toOrganisation(orgById(state(), id)!, true) };
        }),
    },

    offers: {
      list: (query) =>
        call('offers', 'list', () => {
          const items = listOffers(query)
            .filter((o) => !query.status || o.status === query.status)
            .filter((o) => inRange(o.createdAt, query.from, query.to))
            .map((o) => toOffer(o, state()));
          return { items, nextCursor: null };
        }),
      get: (id) =>
        call('offers', 'get', () => {
          const offer = offerById(state(), id);
          if (!offer) throw notFound();
          return offerDetail(offer);
        }),
      post: (fields, _photos, idempotencyKey) =>
        call('offers', 'post', () => {
          const org = myOrg();
          const user = me();
          const existing = idempotency.get(idempotencyKey);
          if (existing) {
            return { offer: toOffer(offerById(state(), existing)!, state()), notifiedCount: 0 };
          }
          const notified = eligibleRecipientIds(state(), fields);
          const before = new Set(state().offers.map((o) => o.id));
          store.dispatch({
            type: 'POST_OFFER',
            offer: {
              title: fields.title,
              description: fields.description ?? '',
              category: fields.category,
              offeredQuantityKg: fields.offeredQuantityKg,
              coldChain: fields.coldChain,
              photo: 'mixed',
              availableFrom: fields.availableFrom ?? new Date().toISOString(),
              collectionDeadline: fields.collectionDeadline,
            },
            userId: user.id,
            organisationId: org.id,
            notifiedOrganisationIds: notified,
          });
          const offer = state().offers.find((o) => !before.has(o.id))!;
          idempotency.set(idempotencyKey, offer.id);
          return { offer: toOffer(offer, state()), notifiedCount: notified.length };
        }),
      cancel: (id) =>
        call('offers', 'cancel', () => {
          const offer = offerById(state(), id);
          if (!offer) throw notFound();
          if (offer.status !== 'open') throw invalidState('Only an open offer can be cancelled.');
          store.dispatch({ type: 'CANCEL_OFFER', offerId: id });
          return { offer: toOffer(offerById(state(), id)!, state()) };
        }),
      claim: (id, body) =>
        call('offers', 'claim', () => {
          const org = myOrg();
          if (!canClaim(org)) {
            throw new ApiError(
              'FORBIDDEN',
              'Your organisation has to be verified before it can claim.',
            );
          }
          const offer = offerById(state(), id);
          if (!offer) throw notFound();
          const held = activeClaimForOffer(state(), id);
          if (!held || held.recipientOrganisationId !== org.id) {
            store.dispatch({
              type: 'CLAIM_OFFER',
              offerId: id,
              userId: me().id,
              transportNeeded: body.transportNeeded,
            });
          }
          const claim = activeClaimForOffer(state(), id);
          if (!claim || claim.recipientOrganisationId !== org.id) {
            throw new ApiError('OFFER_UNAVAILABLE', 'This offer has already been claimed.');
          }
          const donor = orgById(state(), offer.donorOrganisationId)!;
          return {
            claim: toClaim(claim, state()),
            donorContact: {
              name: donor.contactName,
              phone: donor.contactPhone,
              addressLine: donor.suburb,
              suburb: donor.suburb,
            },
          };
        }),
    },

    claims: {
      list: (query) =>
        call('claims', 'list', () => {
          const s = state();
          const user = me();
          const claims = isStaff(user)
            ? s.claims
            : claimsForRecipient(s, myOrg().id).map((v) => v.claim);
          const items = claims
            .filter((c) => !query.status || c.status === query.status)
            .map((c) => ({ ...toClaim(c, s), offer: toOffer(offerById(s, c.offerId)!, s) }));
          return { items };
        }),
      release: (id, body) =>
        call('claims', 'release', () => {
          const claim = state().claims.find((c) => c.id === id);
          if (!claim || claim.recipientOrganisationId !== myOrg().id) throw notFound();
          store.dispatch({ type: 'RELEASE_CLAIM', claimId: id, reason: body.reason ?? '' });
          const s = state();
          const released = s.claims.find((c) => c.id === id)!;
          return { claim: toClaim(released, s), offer: toOffer(offerById(s, claim.offerId)!, s) };
        }),
      dispatch: (id, body) =>
        call('claims', 'dispatch', () => {
          const claim = state().claims.find((c) => c.id === id);
          if (!claim) throw notFound();
          if (claim.status !== 'active' || !claim.transportNeeded) {
            throw invalidState('Only an active claim that needs transport can be dispatched.');
          }
          store.dispatch({
            type: 'DISPATCH_DRIVER',
            claimId: id,
            userId: me().id,
            driverName: body.driverName,
            driverPhone: body.driverPhone,
          });
          return { collection: toCollection(collectionForClaim(state(), id)!) };
        }),
      updateCollection: (id, body) =>
        call('claims', 'updateCollection', () => {
          if (!state().collections.some((c) => c.id === id)) throw notFound();
          store.dispatch({ type: 'FAKE_UPDATE_COLLECTION', collectionId: id, status: body.status });
          return { collection: toCollection(state().collections.find((c) => c.id === id)!) };
        }),
    },

    handovers: {
      donorConfirm: (offerId, fields) =>
        call('handovers', 'donorConfirm', () => {
          const offer = offerById(state(), offerId);
          if (!offer || offer.donorOrganisationId !== myOrg().id) throw notFound();
          const claim = activeClaimForOffer(state(), offerId);
          if (!claim || claim.status !== 'active')
            throw invalidState('This offer has no active claim.');
          const before = new Set(state().offers.map((o) => o.id));
          store.dispatch({
            type: 'CONFIRM_HANDOVER_DONOR',
            claimId: claim.id,
            userId: me().id,
            quantityKg: fields.collectedQuantityKg,
            photo: offer.photo,
          });
          const s = state();
          const remainder = s.offers.find((o) => !before.has(o.id));
          return {
            handover: toHandover(handoverForClaim(s, claim.id)!, s),
            remainderOffer: remainder ? toOffer(remainder, s) : null,
          };
        }),
      recipientConfirm: (offerId, body) =>
        call('handovers', 'recipientConfirm', () => {
          const claim = activeClaimForOffer(state(), offerId);
          if (!claim || claim.recipientOrganisationId !== myOrg().id) throw notFound();
          const handover = handoverForClaim(state(), claim.id);
          if (!handover) throw invalidState('The donor has not recorded the handover yet.');
          if (!handover.recipientConfirmedAt) {
            store.dispatch({
              type: 'CONFIRM_HANDOVER_RECIPIENT',
              claimId: claim.id,
              userId: me().id,
              condition: body.conditionOnReceipt,
              note: body.conditionNotes ?? '',
            });
          }
          const s = state();
          return {
            handover: toHandover(handoverForClaim(s, claim.id)!, s),
            offer: toOffer(offerById(s, offerId)!, s),
          };
        }),
      list: (query) =>
        call('handovers', 'list', () => {
          const s = state();
          const items = s.handovers
            .filter((h) => !query.condition || h.conditionOnReceipt === query.condition)
            .filter((h) => query.resolved === undefined || Boolean(h.resolvedAt) === query.resolved)
            .map((h) => {
              const claim = s.claims.find((c) => c.id === h.claimId)!;
              const recipient = orgById(s, claim.recipientOrganisationId)!;
              return {
                ...toHandover(h, s),
                offer: toOffer(offerById(s, claim.offerId)!, s),
                recipient: {
                  id: recipient.id,
                  name: recipient.name,
                  suburb: recipient.suburb,
                  location: recipient.location,
                },
              };
            });
          return { items };
        }),
      resolve: (id, body) =>
        call('handovers', 'resolve', () => {
          const handover = state().handovers.find((h) => h.id === id);
          if (!handover || !isDispute(handover)) throw notFound();
          if (handover.resolvedAt) throw invalidState('This dispute has already been resolved.');
          store.dispatch({
            type: 'RESOLVE_DISPUTE',
            handoverId: id,
            note: body.resolutionNote,
            userId: me().id,
          });
          return {
            handover: toHandover(
              state().handovers.find((h) => h.id === id)!,
              state(),
            ),
          };
        }),
    },

    notifications: {
      list: () =>
        call('notifications', 'list', () => {
          const user = me();
          const mine = state().notifications.filter((n) => n.userId === user.id);
          return {
            items: mine.map(toNotification),
            unread: mine.filter((n) => !n.readAt).length,
          };
        }),
      markRead: (id) =>
        call('notifications', 'markRead', () => {
          me();
          store.dispatch({ type: 'MARK_NOTIFICATION_READ', notificationId: id });
        }),
    },

    reports: {
      impact: (query) =>
        call('reports', 'impact', () => {
          const s = state();
          const rows = new Map<string, ImpactRow>();
          for (const h of completedHandovers(s)) {
            if (!inRange(h.recipientConfirmedAt!, query.from, query.to)) continue;
            const claim = s.claims.find((c) => c.id === h.claimId)!;
            const offer = offerById(s, claim.offerId)!;
            const org =
              query.groupBy === 'donor'
                ? orgById(s, offer.donorOrganisationId)
                : query.groupBy === 'recipient'
                  ? orgById(s, claim.recipientOrganisationId)
                  : undefined;
            const key = org?.id ?? saDay(h.recipientConfirmedAt!).slice(0, 7);
            const row = rows.get(key) ?? { key, label: org?.name ?? key, kg: 0, meals: 0 };
            row.kg += h.collectedQuantityKg;
            rows.set(key, row);
          }
          const items = [...rows.values()].map((r) => ({
            ...r,
            meals: Math.floor(r.kg / KG_PER_MEAL),
          }));
          const kg = items.reduce((sum, r) => sum + r.kg, 0);
          return { rows: items, totals: { kg, meals: Math.floor(kg / KG_PER_MEAL) } };
        }),
      outcomes: (query) =>
        call('reports', 'outcomes', () => {
          const s = state();
          const offers = s.offers.filter((o) => inRange(o.createdAt, query.from, query.to));
          const claimsOf = (o: Offer) => s.claims.filter((c) => c.offerId === o.id);
          const claimed = offers.filter((o) => claimsOf(o).length > 0).length;
          const expiredClaimed = offers.filter(
            (o) => o.status === 'expired' && claimsOf(o).some((c) => c.status === 'expired'),
          ).length;
          const expired = offers.filter((o) => o.status === 'expired').length;
          const fulfilled = s.claims.filter(
            (c) => c.status === 'fulfilled' && offers.some((o) => o.id === c.offerId),
          );
          return {
            posted: offers.length,
            open: offers.filter((o) => o.status === 'open').length,
            claimed,
            collected: offers.filter((o) => o.status === 'collected').length,
            expiredUnclaimed: expired - expiredClaimed,
            expiredClaimed,
            cancelled: offers.filter((o) => o.status === 'cancelled').length,
            claimedPct: offers.length === 0 ? 0 : Math.round((claimed / offers.length) * 1000) / 10,
            distinctRecipients: new Set(fulfilled.map((c) => c.recipientOrganisationId)).size,
          };
        }),
    },

    certificates: {
      list: (query) =>
        call('certificates', 'list', () => {
          const user = me();
          const donorId = user.role === 'donor' ? myOrg().id : query.donorOrganisationId;
          const items = state()
            .certificates.filter((c) => c.status === 'issued')
            .filter((c) => !donorId || c.donorOrganisationId === donorId)
            .map(toCertificate);
          return { items };
        }),
      issue: (body) =>
        call('certificates', 'issue', () => {
          const pending = state().certificates.find(
            (c) =>
              c.status === 'pending' &&
              c.donorOrganisationId === body.donorOrganisationId &&
              saDay(c.periodStart) >= body.periodStart &&
              saDay(c.periodEnd) <= body.periodEnd,
          );
          if (!pending)
            throw invalidState('There are no uncertified handovers for that donor and period.');
          store.dispatch({ type: 'ISSUE_CERTIFICATE', certificateId: pending.id, userId: me().id });
          return {
            certificate: toCertificate(state().certificates.find((c) => c.id === pending.id)!),
          };
        }),
      rates: () => call('certificates', 'rates', () => ({ items: rates })),
      updateRates: (body) =>
        call('certificates', 'updateRates', () => {
          const user = me();
          const now = new Date().toISOString();
          rates = rates.map((r) => {
            const change = body.items.find((i) => i.category === r.category);
            return change
              ? { ...r, ratePerKg: change.ratePerKg, updatedAt: now, updatedByUserId: user.id }
              : r;
          });
          return { items: rates };
        }),
    },

    users: {
      list: (query) =>
        call('users', 'list', () => {
          const s = state();
          const q = query.q?.toLowerCase();
          const items = s.users
            .filter((u) => !query.role || u.role === query.role)
            .filter((u) => !query.status || (u.active ? 'active' : 'disabled') === query.status)
            .filter((u) => !q || u.name.toLowerCase().includes(q))
            .map((u) => toUser(u, s));
          return { items };
        }),
      create: (body) =>
        call('users', 'create', () => {
          const user: User = {
            id: nextId('usr'),
            name: body.fullName,
            role: body.role,
            organisationId: body.organisationId ?? null,
            jobTitle: '',
            language: body.languagePreference,
            active: true,
            personaNote: '',
          };
          store.dispatch({ type: 'FAKE_ADD_USER', user });
          return {
            user: { ...toUser(user, state()), mustChangePassword: true },
            tempPassword: 'Demo-Temp-1234',
          };
        }),
      update: (id, body) =>
        call('users', 'update', () => {
          const actor = me();
          if (!state().users.some((u) => u.id === id)) throw notFound();
          if (id === actor.id && body.status === 'disabled') {
            throw invalidState('You cannot disable your own account.');
          }
          store.dispatch({
            type: 'FAKE_UPDATE_USER',
            targetUserId: id,
            role: body.role,
            active: body.status === undefined ? undefined : body.status === 'active',
          });
          return {
            user: toUser(
              state().users.find((u) => u.id === id)!,
              state(),
            ),
          };
        }),
      auditLog: (query) =>
        call('users', 'auditLog', () => {
          const items = state()
            .audit.filter((entry) => inRange(entry.at, query.from, query.to))
            .map(toAuditEntry)
            .filter((entry) => entry !== null)
            .filter((entry) => !query.action || entry.action === query.action);
          return { items };
        }),
    },
  };
}
