import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/** the accessibility audit. it runs on the demo data and needs no API */
export default defineConfig({
  testDir: 'a11y',
  outputDir: 'a11y/out/results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // the default of half the cores gives one worker on a two-core runner
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'a11y/out/report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    // a cached shell from the service worker could hide a fresh build
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: '360', use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: '1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `vite build --outDir a11y/out/dist --logLevel warn && vite preview --outDir a11y/out/dist --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_DATA: 'fake', VITE_FAKE_DELAY_MS: '0' },
    // an HTTP-mode preview left running on the port would fail every sign-in
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
