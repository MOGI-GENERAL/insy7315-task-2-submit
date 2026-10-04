import { describe, expect, test } from 'vitest';
import { CSRF_HEADER, IDEMPOTENCY_HEADER } from '@fedsa/contract';
import { isApiError } from '../ApiError';
import { createApiClient, withQuery } from './client';
import { createHttpDataLayer } from '.';

/**
 * references:
 * - https://vitest.dev/api/ - Vitest API reference
 * - https://martinfowler.com/articles/mocksArentStubs.html - test doubles (fakes, stubs, mocks)
 * - https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html - CSRF synchronizer token pattern and token rotation on login
 * - https://docs.stripe.com/api/idempotent_requests - idempotency keys in practice
 * - https://www.rfc-editor.org/rfc/rfc7578 - multipart/form-data
 * - https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects - FormData and why Content-Type is left for the browser to set
 * - https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API - Fetch API (fetch, Response, File)
 * - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent - escaping path segments
 * - https://owasp.org/www-community/attacks/Path_Traversal - path traversal attacks
 */

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const envelope = (status: number, code: string, fields?: Record<string, string>) =>
  json(status, { error: { code, message: 'server text', ...(fields ? { fields } : {}) } });

/** answers each request from the queue in turn, after handing out numbered CSRF tokens */
function fakeServer(replies: Response[]) {
  const calls: Call[] = [];
  let tokens = 0;
  const fetchFn = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body,
    });
    if (url === '/api/auth/csrf') return json(200, { csrfToken: `token-${++tokens}` });
    const next = replies.shift();
    if (!next) throw new Error(`no reply queued for ${url}`);
    return next;
  };
  return { calls, fetchFn: fetchFn as typeof fetch };
}

describe('API client', () => {
  test('fetches a CSRF token once and sends it with every write', async () => {
    const server = fakeServer([json(200, { ok: 1 }), json(200, { ok: 2 })]);
    const api = createApiClient(server.fetchFn);

    await api.send('POST', '/api/a', { json: {} });
    await api.send('POST', '/api/b', { json: {} });

    expect(server.calls.filter((c) => c.url === '/api/auth/csrf')).toHaveLength(1);
    const writes = server.calls.filter((c) => c.url !== '/api/auth/csrf');
    expect(writes.map((c) => c.headers[CSRF_HEADER])).toEqual(['token-1', 'token-1']);
  });

  test('a rejected token is replaced and the write retried once', async () => {
    const server = fakeServer([envelope(403, 'CSRF_INVALID'), json(201, { claimed: true })]);
    const api = createApiClient(server.fetchFn);

    await expect(api.send('POST', '/api/offers/1/claim', { json: {} })).resolves.toEqual({
      claimed: true,
    });
    const writes = server.calls.filter((c) => c.url !== '/api/auth/csrf');
    expect(writes.map((c) => c.headers[CSRF_HEADER])).toEqual(['token-1', 'token-2']);
  });

  test('a second rejection is not retried again', async () => {
    const server = fakeServer([envelope(403, 'CSRF_INVALID'), envelope(403, 'CSRF_INVALID')]);
    const api = createApiClient(server.fetchFn);

    const error = await api.send('POST', '/api/a').catch((e: unknown) => e);

    expect(isApiError(error, 'CSRF_INVALID')).toBe(true);
    expect(server.calls.filter((c) => c.url === '/api/a')).toHaveLength(2);
  });

  test('turns an error envelope into an ApiError with its field errors', async () => {
    const server = fakeServer([
      envelope(400, 'VALIDATION_FAILED', { 'user.email': 'Already registered' }),
    ]);
    const api = createApiClient(server.fetchFn);

    const error = await api.send('POST', '/api/auth/register', { json: {} }).catch((e) => e);

    expect(isApiError(error, 'VALIDATION_FAILED') && error.fields).toEqual({
      'user.email': 'Already registered',
    });
  });

  test('a gateway page that is not JSON becomes INTERNAL', async () => {
    const server = fakeServer([new Response('<html>Bad gateway</html>', { status: 502 })]);
    const api = createApiClient(server.fetchFn);

    const error = await api.get('/api/offers').catch((e) => e);

    expect(isApiError(error, 'INTERNAL')).toBe(true);
  });

  test('204 resolves with nothing', async () => {
    const server = fakeServer([new Response(null, { status: 204 })]);
    await expect(createApiClient(server.fetchFn).send('POST', '/api/x')).resolves.toBeUndefined();
  });

  test('query strings leave out unset values', () => {
    expect(withQuery('/api/offers', { view: 'feed', status: undefined, cursor: 'abc' })).toBe(
      '/api/offers?view=feed&cursor=abc',
    );
    expect(withQuery('/api/claims', { status: undefined })).toBe('/api/claims');
  });
});

describe('HTTP repositories', () => {
  test('signing in throws the old token away', async () => {
    const server = fakeServer([json(200, { user: {}, organisation: null }), json(200, {})]);
    const data = createHttpDataLayer(createApiClient(server.fetchFn));

    await data.auth.login({ email: 'a@example.org', password: 'x' });
    await data.offers.claim('1', { transportNeeded: false });

    const tokens = server.calls
      .filter((c) => c.url !== '/api/auth/csrf')
      .map((c) => c.headers[CSRF_HEADER]);
    expect(tokens).toEqual(['token-1', 'token-2']);
  });

  test('`me` is null when nobody is signed in', async () => {
    const server = fakeServer([envelope(401, 'UNAUTHENTICATED')]);
    const data = createHttpDataLayer(createApiClient(server.fetchFn));

    await expect(data.auth.me()).resolves.toBeNull();
  });

  test('posting an offer sends multipart with the photos and the idempotency key', async () => {
    const server = fakeServer([json(201, { offer: {}, notifiedCount: 3 })]);
    const data = createHttpDataLayer(createApiClient(server.fetchFn));
    const photo = new File([new Uint8Array([1, 2, 3])], 'bread.jpg', { type: 'image/jpeg' });

    await data.offers.post(
      {
        title: '62 loaves',
        category: 'bakery',
        offeredQuantityKg: 31,
        coldChain: 'ambient',
        collectionDeadline: '2026-10-04T15:30:00.000Z',
      },
      [photo],
      'key-1',
    );

    const call = server.calls.find((c) => c.url === '/api/offers')!;
    expect(call.headers[IDEMPOTENCY_HEADER]).toBe('key-1');
    expect(call.headers['content-type']).toBeUndefined();
    const form = call.body as FormData;
    expect(form.get('offeredQuantityKg')).toBe('31');
    expect(form.has('description')).toBe(false);
    expect(form.getAll('photos')).toHaveLength(1);
  });

  test('IDs are escaped into the path', async () => {
    const server = fakeServer([json(200, {})]);
    const data = createHttpDataLayer(createApiClient(server.fetchFn));

    await data.offers.get('../users');

    expect(server.calls.at(-1)!.url).toBe('/api/offers/..%2Fusers');
  });
});
