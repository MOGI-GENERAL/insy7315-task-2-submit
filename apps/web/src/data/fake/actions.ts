import { suburbLocation, type RegisterRequest, type Role } from '@fedsa/contract';
import type { Action } from '../../store/reducer';
import type { AppState, Organisation, User } from '../../store/types';

/** writes the prototype had no screen for. they live with the fakes, not the reducer */
export type FakeAction =
  | { type: 'FAKE_REGISTER'; request: RegisterRequest; organisationId: string; userId: string }
  | {
      type: 'FAKE_UPDATE_ORGANISATION';
      organisationId: string;
      changes: Partial<Omit<Organisation, 'id' | 'type' | 'status'>>;
    }
  | { type: 'FAKE_ADD_USER'; user: User }
  | { type: 'FAKE_UPDATE_USER'; targetUserId: string; role?: Role; active?: boolean }
  | { type: 'FAKE_UPDATE_COLLECTION'; collectionId: string; status: 'completed' | 'cancelled' };

export function isFakeAction(action: Action | FakeAction): action is FakeAction {
  return action.type.startsWith('FAKE_');
}

export function fakeReducer(state: AppState, action: FakeAction): AppState {
  switch (action.type) {
    case 'FAKE_REGISTER': {
      const { request, organisationId, userId } = action;
      const o = request.organisation;
      const organisation: Organisation = {
        id: organisationId,
        name: o.name,
        type: request.role,
        suburb: o.suburb,
        location: suburbLocation(o.suburb),
        contactName: o.contactName,
        contactPhone: o.contactPhone,
        status: request.role === 'donor' ? 'active' : 'pending',
        capacityNotes: '',
        joinedAt: new Date().toISOString(),
        ...(request.role === 'recipient'
          ? {
              storageAmbient: request.organisation.storageAmbient,
              storageRefrigerated: request.organisation.storageRefrigerated,
              storageFrozen: request.organisation.storageFrozen,
              maxCapacityKg: request.organisation.maxCapacityKg,
              hasTransport: request.organisation.hasTransport,
              mealsPerDay: request.organisation.mealsPerDay,
            }
          : {}),
      };
      const user: User = {
        id: userId,
        name: request.user.fullName,
        role: request.role,
        organisationId,
        jobTitle: '',
        language: request.user.languagePreference,
        active: true,
        personaNote: '',
      };
      return {
        ...state,
        organisations: [...state.organisations, organisation],
        users: [...state.users, user],
        currentUserId: userId,
        language: user.language,
      };
    }

    case 'FAKE_UPDATE_ORGANISATION':
      return {
        ...state,
        organisations: state.organisations.map((o) =>
          o.id === action.organisationId ? { ...o, ...action.changes } : o,
        ),
      };

    case 'FAKE_ADD_USER':
      return { ...state, users: [...state.users, action.user] };

    case 'FAKE_UPDATE_USER':
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.targetUserId
            ? {
                ...u,
                ...(action.role ? { role: action.role } : {}),
                ...(action.active !== undefined ? { active: action.active } : {}),
              }
            : u,
        ),
      };

    case 'FAKE_UPDATE_COLLECTION':
      return {
        ...state,
        collections: state.collections.map((c) =>
          c.id === action.collectionId ? { ...c, status: action.status } : c,
        ),
      };
  }
}
