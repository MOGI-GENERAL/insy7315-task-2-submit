import { IDEMPOTENCY_HEADER } from '@fedsa/contract';
import type * as C from '@fedsa/contract';
import { isApiError } from '../ApiError';
import type { DataLayer } from '../repositories';
import { createApiClient, type ApiClient } from './client';

/**
 * references:
 * - https://martinfowler.com/eaaCatalog/repository.html - Repository pattern
 * - https://owasp.org/www-community/attacks/Path_Traversal - path traversal attacks the escaping guards against
 * - https://developer.mozilla.org/en-US/docs/Web/API/FormData/append - FormData.append, including repeated keys for multiple photos
 * - https://www.rfc-editor.org/rfc/rfc7578 - multipart/form-data
 * - https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/ - Idempotency-Key header draft
 * - https://docs.stripe.com/api/idempotent_requests - idempotency keys in practice
 * - https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html - CSRF tokens tied to the session
 * - https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html - renewing the session on login, logout and password change
 * - https://www.rfc-editor.org/rfc/rfc9110 - HTTP methods and status codes (401 for the signed-out check)
 * - https://www.rfc-editor.org/rfc/rfc5789 - PATCH method for partial updates
 */

const id = (value: string) => encodeURIComponent(value);

/** multipart text fields. unset optional fields are left out, not sent empty */
function formOf(fields: Record<string, string | number | undefined>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, String(value));
  }
  return form;
}

export function createHttpDataLayer(api: ApiClient = createApiClient()): DataLayer {
  return {
    auth: {
      async register(body) {
        const session = await api.send<C.SessionResponse>('POST', '/api/auth/register', {
          json: body,
        });
        api.forgetCsrfToken();
        return session;
      },
      async login(body) {
        const session = await api.send<C.SessionResponse>('POST', '/api/auth/login', {
          json: body,
        });
        api.forgetCsrfToken();
        return session;
      },
      async logout() {
        try {
          await api.send<void>('POST', '/api/auth/logout');
        } finally {
          api.forgetCsrfToken();
        }
      },
      async me() {
        try {
          return await api.get<C.SessionResponse>('/api/me');
        } catch (error) {
          if (isApiError(error, 'UNAUTHENTICATED')) return null;
          throw error;
        }
      },
      updateMe: (body) => api.send('PATCH', '/api/me', { json: body }),
      async changePassword(body) {
        await api.send<void>('POST', '/api/me/password', { json: body });
        api.forgetCsrfToken();
      },
    },

    organisations: {
      mine: () => api.get('/api/organisations/me'),
      updateMine: (body) => api.send('PATCH', '/api/organisations/me', { json: body }),
      list: (query) => api.get('/api/organisations', query),
      get: (orgId) => api.get(`/api/organisations/${id(orgId)}`),
      decide: (orgId, body) =>
        api.send('POST', `/api/organisations/${id(orgId)}/verification`, { json: body }),
      saveNotes: (orgId, body) =>
        api.send('PUT', `/api/organisations/${id(orgId)}/notes`, { json: body }),
    },

    offers: {
      list: (query) => api.get('/api/offers', query),
      get: (offerId) => api.get(`/api/offers/${id(offerId)}`),
      post(fields, photos, idempotencyKey) {
        const form = formOf(fields);
        for (const photo of photos) form.append('photos', photo);
        return api.send('POST', '/api/offers', {
          form,
          headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
        });
      },
      cancel: (offerId, body) =>
        api.send('POST', `/api/offers/${id(offerId)}/cancel`, { json: body }),
      claim: (offerId, body) =>
        api.send('POST', `/api/offers/${id(offerId)}/claim`, { json: body }),
    },

    claims: {
      list: (query) => api.get('/api/claims', query),
      release: (claimId, body) =>
        api.send('POST', `/api/claims/${id(claimId)}/release`, { json: body }),
      async dispatch(claimId, body) {
        let status = 0;
        const response = await api.send<C.CollectionResponse>(
          'POST',
          `/api/claims/${id(claimId)}/collection`,
          { json: body, onStatus: (s) => (status = s) },
        );
        return { ...response, created: status === 201 };
      },
      updateCollection: (collectionId, body) =>
        api.send('PATCH', `/api/collections/${id(collectionId)}`, { json: body }),
      rotateDriverLink: (collectionId, body) =>
        api.send('PUT', `/api/collections/${id(collectionId)}/driver-link`, { json: body }),
    },

    driver: {
      collection: (token) => api.getAnonymous(`/api/driver-collections/${id(token)}`),
    },

    handovers: {
      donorConfirm(offerId, fields, photo) {
        const form = formOf(fields);
        if (photo) form.append('photo', photo);
        return api.send('POST', `/api/offers/${id(offerId)}/handover/donor-confirm`, { form });
      },
      recipientConfirm: (offerId, body) =>
        api.send('POST', `/api/offers/${id(offerId)}/handover/recipient-confirm`, { json: body }),
      list: (query) => api.get('/api/handovers', query),
      resolve: (handoverId, body) =>
        api.send('POST', `/api/handovers/${id(handoverId)}/resolution`, { json: body }),
    },

    notifications: {
      list: () => api.get('/api/notifications'),
      markRead: (notificationId) =>
        api.send('POST', `/api/notifications/${id(notificationId)}/read`),
      async pushKey() {
        try {
          return (await api.get<C.VapidKeyResponse>('/api/push/public-key')).vapidPublicKey;
        } catch (error) {
          if (isApiError(error, 'NOT_FOUND')) return null;
          throw error;
        }
      },
      subscribePush: (body) => api.send('POST', '/api/me/push-subscriptions', { json: body }),
      unsubscribePush: (body) => api.send('DELETE', '/api/me/push-subscriptions', { json: body }),
    },

    reports: {
      impact: (query) => api.get('/api/reports/impact', query),
      outcomes: (query) => api.get('/api/reports/outcomes', query),
    },

    certificates: {
      list: (query) => api.get('/api/tax-certificates', query),
      issue: (body) => api.send('POST', '/api/tax-certificates', { json: body }),
      rates: () => api.get('/api/valuation-rates'),
      updateRates: (body) => api.send('PUT', '/api/valuation-rates', { json: body }),
    },

    users: {
      list: (query) => api.get('/api/users', query),
      create: (body) => api.send('POST', '/api/users', { json: body }),
      update: (userId, body) => api.send('PATCH', `/api/users/${id(userId)}`, { json: body }),
      resetPassword: (userId) => api.send('POST', `/api/users/${id(userId)}/password-reset`),
      auditLog: (query) => api.get('/api/audit-log', query),
    },
  };
}
