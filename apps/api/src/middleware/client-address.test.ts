import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { afterAll, describe, expect, test } from 'vitest';
import { netlifySignature } from '../../test/netlify-signature.js';
import { errorHandler } from './error-handler.js';
import { createLogger } from '../logger.js';
import {
  NETLIFY_CLIENT_IP_HEADER,
  NETLIFY_SIGNATURE_HEADER,
  clientAddress,
  proxySettings,
  verifyNetlifySignature,
  type ProxySettings,
} from './client-address.js';

const SECRET = 'unit-test-proxy-secret';
const silent = createLogger({ write: () => {} });

describe('verifyNetlifySignature', () => {
  test('accepts a token signed with the secret', () => {
    expect(verifyNetlifySignature(netlifySignature(SECRET), SECRET)).toBe(true);
  });

  test.each([
    ['another secret', netlifySignature('not-the-secret')],
    ['an expired token', netlifySignature(SECRET, { exp: Math.floor(Date.now() / 1000) - 1 })],
    ['another issuer', netlifySignature(SECRET, { iss: 'someone-else' })],
    ['no expiry', netlifySignature(SECRET, { exp: undefined })],
    ['another algorithm', netlifySignature(SECRET, {}, 'none')],
    ['a token cut short', netlifySignature(SECRET).split('.').slice(0, 2).join('.')],
    ['a payload swapped after signing', swapPayload(netlifySignature(SECRET))],
    ['garbage', 'not.a.token'],
  ])('refuses %s', (_label, token) => {
    expect(verifyNetlifySignature(token, SECRET)).toBe(false);
  });
});

function swapPayload(token: string) {
  const [header, , signature] = token.split('.');
  const payload = Buffer.from(JSON.stringify({ iss: 'netlify', exp: 9999999999 })).toString(
    'base64url',
  );
  return `${header}.${payload}.${signature}`;
}

describe('proxySettings', () => {
  test('is off without a secret', () => {
    expect(proxySettings({}, silent)).toBeNull();
  });

  test('refuses to require a signature it has no secret for', () => {
    expect(() => proxySettings({ API_PROXY_REQUIRED: 'true' }, silent)).toThrow();
  });

  test('reads the secret and the requirement', () => {
    expect(proxySettings({ API_PROXY_SECRET: SECRET, API_PROXY_REQUIRED: 'true' }, silent)).toEqual(
      { secret: SECRET, required: true },
    );
  });
});

const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((server) => server.close()));

/** one trusted hop as on Render. it answers with the address the limits would count */
async function start(settings: ProxySettings | null) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(pinoHttp({ logger: silent }));
  app.use(clientAddress(settings));
  app.use((req, res) => {
    res.json({ clientIp: req.clientIp });
  });
  app.use(errorHandler);
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (path: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { headers });
}

describe('clientAddress', () => {
  test('a forged forwarded address is not the client address', async () => {
    const request = await start(null);

    const res = await request('/api/auth/csrf', { 'x-forwarded-for': '203.0.113.9, 10.1.1.1' });

    expect(await res.json()).toEqual({ clientIp: '10.1.1.1' });
  });

  test("a signed request is counted by Netlify's client address", async () => {
    const request = await start({ secret: SECRET, required: false });

    const res = await request('/api/auth/csrf', {
      'x-forwarded-for': '10.1.1.1',
      [NETLIFY_SIGNATURE_HEADER]: netlifySignature(SECRET),
      [NETLIFY_CLIENT_IP_HEADER]: '198.51.100.7',
    });

    expect(await res.json()).toEqual({ clientIp: '198.51.100.7' });
  });

  test("an unsigned request cannot choose its address with Netlify's header", async () => {
    const request = await start({ secret: SECRET, required: false });

    const res = await request('/api/auth/csrf', {
      'x-forwarded-for': '10.1.1.1',
      [NETLIFY_SIGNATURE_HEADER]: netlifySignature('not-the-secret'),
      [NETLIFY_CLIENT_IP_HEADER]: '198.51.100.7',
    });

    expect(await res.json()).toEqual({ clientIp: '10.1.1.1' });
  });

  test('when a signature is required, only Twilio and the health check go without', async () => {
    const request = await start({ secret: SECRET, required: true });

    expect((await request('/api/auth/csrf')).status).toBe(403);
    expect((await request('/api/health')).status).toBe(200);
    expect((await request('/api/webhooks/twilio/inbound')).status).toBe(200);
    const signed = await request('/api/auth/csrf', {
      [NETLIFY_SIGNATURE_HEADER]: netlifySignature(SECRET),
    });
    expect(signed.status).toBe(200);
  });
});
