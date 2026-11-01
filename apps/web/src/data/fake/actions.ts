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
  | { type: 'FAKE_ADD_USER'; user: User; actorUserId: string }
  | {
      type: 'FAKE_UPDATE_USER';
      targetUserId: string;
      actorUserId: string;
      role?: Role;
      active?: boolean;
    }
  | { type: 'FAKE_RESET_PASSWORD'; targetUserId: string; actorUserId: string }
  | { type: 'FAKE_UPDATE_COLLECTION'; collectionId: string; status: 'completed' | 'cancelled' };

let sequence = 0;
const auditId = () => `aud-fake${(++sequence).toString(36)}`;

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
      return {
        ...state,
        users: [...state.users, action.user],
        audit: [
          {
            id: auditId(),
            actorUserId: action.actorUserId,
            action: 'Created account',
            target: action.user.name,
            detail: '',
            at: new Date().toISOString(),
          },
          ...state.audit,
        ],
      };

    case 'FAKE_RESET_PASSWORD': {
      const target = state.users.find((u) => u.id === action.targetUserId);
      if (!target) return state;
      return {
        ...state,
        audit: [
          {
            id: auditId(),
            actorUserId: action.actorUserId,
            action: 'Reset password',
            target: target.name,
            detail: '',
            at: new Date().toISOString(),
          },
          ...state.audit,
        ],
      };
    }

    case 'FAKE_UPDATE_USER': {
      const target = state.users.find((u) => u.id === action.targetUserId);
      if (!target) return state;
      const at = new Date().toISOString();
      const entry = (name: string, detail: string) => ({
        id: auditId(),
        actorUserId: action.actorUserId,
        action: name,
        target: target.name,
        detail,
        at,
      });
      const entries = [
        ...(action.active !== undefined && action.active !== target.active
          ? [entry(action.active ? 'Enabled account' : 'Disabled account', '')]
          : []),
        ...(action.role && action.role !== target.role
          ? [entry('Changed role', `${target.role} to ${action.role}`)]
          : []),
      ];
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === target.id
            ? {
                ...u,
                ...(action.role ? { role: action.role } : {}),
                ...(action.active !== undefined ? { active: action.active } : {}),
              }
            : u,
        ),
        audit: [...entries, ...state.audit],
      };
    }

    case 'FAKE_UPDATE_COLLECTION':
      return {
        ...state,
        collections: state.collections.map((c) =>
          c.id === action.collectionId ? { ...c, status: action.status } : c,
        ),
      };
  }
}
