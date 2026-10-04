import { CSRF_HEADER } from '@fedsa/contract';
import { SESSION_COOKIE } from '../src/middleware/session.js';

let clientCount = 0;

/**
 * a browser stand-in that keeps the session cookie and CSRF token. each client
 * has its own forwarded address, so rate limits never carry between tests
 */
export class TestClient {
  readonly ip: string;
  cookie = '';
  csrfToken = '';
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    clientCount += 1;
    this.baseUrl = baseUrl;
    this.ip = `10.0.${Math.floor(clientCount / 250)}.${(clientCount % 250) + 1}`;
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    // fetch writes the content type of a FormData or URLSearchParams body itself
    const isForm = body instanceof FormData || body instanceof URLSearchParams;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'x-forwarded-for': this.ip,
        ...(body === undefined || isForm ? {} : { 'content-type': 'application/json' }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrfToken ? { [CSRF_HEADER]: this.csrfToken } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    if (setCookie) {
      const pair = setCookie.split(';')[0]!;
      this.cookie = pair.endsWith('=') ? '' : pair;
    }

    // express-session holds back the last byte until the session is stored, so a
    // request sent before the body is read can find the session missing
    const content = await res.arrayBuffer();
    return new Response(content.byteLength > 0 ? content : null, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }

  get(path: string) {
    return this.request('GET', path);
  }

  post(path: string, body?: unknown) {
    return this.request('POST', path, body);
  }

  async fetchCsrfToken() {
    const res = await this.get('/api/auth/csrf');
    this.csrfToken = ((await res.json()) as { csrfToken: string }).csrfToken;
    return this.csrfToken;
  }
}
