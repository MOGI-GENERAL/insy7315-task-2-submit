import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { expect, test } from 'vitest';
import { createLogger, hideDriverToken, redactRequest } from './logger.js';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

test('hides a token in a page or api path', () => {
  expect(hideDriverToken(`go to https://web.example.org/c/${TOKEN} now`)).toBe(
    'go to https://web.example.org/c/[token] now',
  );
  expect(hideDriverToken(`/api/driver-collections/${TOKEN}?x=1`)).toBe(
    '/api/driver-collections/[token]?x=1',
  );
});

test('leaves an object id or a longer segment after `/c/` alone', () => {
  const objectId = '/api/offers/c/0123456789abcdef01234567';
  const longer = `/c/${TOKEN}extra`;
  expect(hideDriverToken(objectId)).toBe(objectId);
  expect(hideDriverToken(longer)).toBe(longer);
});

test('request logs show neither the url token nor the referer token', async () => {
  const lines: string[] = [];
  const logger = createLogger({ write: (line: string) => void lines.push(line) });
  const app = express();
  app.use(pinoHttp({ logger, serializers: { req: redactRequest } }));
  app.get('/api/driver-collections/:token', (_req, res) => {
    res.json({});
  });
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/driver-collections/${TOKEN}`, {
      headers: { referer: `https://web.example.org/c/${TOKEN}` },
    });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    server.close();
  }

  const output = lines.join('');
  expect(output).toContain('/api/driver-collections/[token]');
  expect(output).toContain('/c/[token]');
  expect(output).not.toContain(TOKEN);
});
