import express from 'express';

export function createApp() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    // Render sets RENDER_GIT_COMMIT, which lets the deploy pipeline confirm the new build is live.
    res.json({ ok: true, version: process.env.RENDER_GIT_COMMIT ?? 'dev' });
  });

  return app;
}
