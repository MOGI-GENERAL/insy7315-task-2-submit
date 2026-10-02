import type { HealthResponse } from '@fedsa/contract';
import express from 'express';

export function createApp() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    // RENDER_GIT_COMMIT lets the deploy pipeline confirm the new build is live
    const body: HealthResponse = { ok: true, version: process.env.RENDER_GIT_COMMIT ?? 'dev' };
    res.json(body);
  });

  return app;
}
