import { CSRF_HEADER, ErrorEnvelope, type CsrfResponse } from '@fedsa/contract';
import { ApiError } from '../ApiError';

/**
 * references
 * - https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API - Fetch API (fetch, Response, Response.json)
 * - https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials - credentials: 'same-origin' and when cookies are sent
 * - https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams - building query strings
 * - https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects - FormData and why Content-Type is left for the browser to set
 * - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_assignment - ??= operator used to cache the token promise
 * - https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html - CSRF synchronizer token pattern, sending the token in a custom header
 * - https://www.rfc-editor.org/rfc/rfc9110 - HTTP semantics and status codes (204 No Content, 4xx/5xx)
 * - https://www.rfc-editor.org/rfc/rfc9457 - problem details format for HTTP API error responses
 * - https://zod.dev/api - schema validation with safeParse for the error envelope
 */

export type Query = Record<string, string | number | boolean | undefined>;

export interface SendOptions {
  query?: Query;
  /** sent as JSON */
  json?: unknown;
  /** sent as multipart. the browser writes the content type and boundary itself */
  form?: FormData;
  headers?: Record<string, string>;
}

export interface ApiClient {
  get<T>(path: string, query?: Query): Promise<T>;
  send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options?: SendOptions): Promise<T>;
  /** the server starts a new session on sign-in and sign-out, and the old token dies with it */
  forgetCsrfToken(): void;
}

const CSRF_PATH = '/api/auth/csrf';

export function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** an error envelope when the API sent one. a proxy or gateway page becomes `INTERNAL` */
async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const envelope = ErrorEnvelope.safeParse(body);
  if (envelope.success) return ApiError.fromEnvelope(envelope.data);
  return new ApiError('INTERNAL', `The server answered ${res.status}`);
}

async function read<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** same-origin. the session cookie goes with every request and to no other site */
export function createApiClient(fetchFn: typeof fetch = (...args) => fetch(...args)): ApiClient {
  let csrfToken: Promise<string> | null = null;

  function token() {
    csrfToken ??= fetchFn(CSRF_PATH, { credentials: 'same-origin' }).then(async (res) => {
      if (!res.ok) throw await toApiError(res);
      return ((await res.json()) as CsrfResponse).csrfToken;
    });
    // a failed fetch must not stick, or every later write would fail the same way
    csrfToken.catch(() => {
      csrfToken = null;
    });
    return csrfToken;
  }

  async function sendOnce(method: string, path: string, options: SendOptions) {
    const headers: Record<string, string> = {
      ...options.headers,
      [CSRF_HEADER]: await token(),
    };
    let body: BodyInit | undefined;
    if (options.form) body = options.form;
    else if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    }
    return fetchFn(withQuery(path, options.query), {
      method,
      headers,
      body,
      credentials: 'same-origin',
    });
  }

  return {
    async get<T>(path: string, query?: Query) {
      const res = await fetchFn(withQuery(path, query), { credentials: 'same-origin' });
      if (!res.ok) throw await toApiError(res);
      return read<T>(res);
    },

    async send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options: SendOptions = {}) {
      let res = await sendOnce(method, path, options);
      if (!res.ok) {
        const error = await toApiError(res);
        // the session expired or was replaced since the token was fetched. one retry with a new one
        if (error.code !== 'CSRF_INVALID') throw error;
        csrfToken = null;
        res = await sendOnce(method, path, options);
        if (!res.ok) throw await toApiError(res);
      }
      return read<T>(res);
    },

    forgetCsrfToken() {
      csrfToken = null;
    },
  };
}
