import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { Role } from '@fedsa/contract';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

/** accepted exceptions. each has its reason in docs/accessibility/README.md */
const EXCEPTIONS: { rule: string; target: string }[] = [];

/** the demo data takes any non-empty password */
const PASSWORD = 'audit';

const ACCOUNTS: Record<Role, string> = {
  // Faiza's claimed bread offer is waiting on the donor's handover
  donor: 'faiza@example.org',
  // Peter's claim on the cold platters is waiting on the recipient's handover
  recipient: 'peter@example.org',
  coordinator: 'nadia@example.org',
  administrator: 'zanele@example.org',
};

/** the demo driver link, and a link that was never issued */
const DRIVER_LINKS = [`/c/${'DemoDriverLink'.repeat(3)}0`, `/c/${'Z'.repeat(43)}`];

const SIGNED_OUT = ['/login', '/register', '/privacy', ...DRIVER_LINKS];

const EVERY_ROLE = ['/notifications', '/account/password'];

const SCREENS: Record<Role, string[]> = {
  donor: [
    '/donor',
    '/donor/post',
    '/donor/offers/off-1006',
    '/donor/offers/off-1006/handover',
    '/donor/certificates',
  ],
  recipient: [
    '/recipient',
    '/recipient/offers/off-1001',
    '/recipient/offers/off-1001/claim',
    '/recipient/claims',
    '/recipient/claims/clm-1007/release',
    '/recipient/scheduled',
    '/recipient/offers/off-1007/handover',
    '/recipient/profile',
    '/recipient/pending',
  ],
  coordinator: [
    '/coordinator',
    '/coordinator/dispatch',
    '/coordinator/verify',
    '/coordinator/organisations',
    '/coordinator/disputes',
  ],
  administrator: [
    '/admin',
    '/admin/kg-meals',
    '/admin/claimed-expired',
    '/admin/export',
    '/admin/certificates',
    '/admin/accounts',
  ],
};

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe('/login');
}

/** the demo data lives in memory. a full page load would sign the user out */
async function go(page: Page, path: string) {
  await page.evaluate((to) => {
    const idx = ((history.state as { idx?: number } | null)?.idx ?? 0) + 1;
    history.pushState({ usr: null, key: `audit-${idx}`, idx }, '', to);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, path);
}

/** a redirect would audit the wrong screen and still pass */
async function settle(page: Page, path: string) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(path);
  await expect(page.locator('.loading')).toHaveCount(0);
}

async function audit(page: Page, testInfo: TestInfo) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  await testInfo.attach('axe-violations.json', {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });

  const blocking: string[] = [];
  for (const violation of violations) {
    for (const node of violation.nodes) {
      const impact = node.impact ?? violation.impact ?? '';
      const target = node.target.join(' ');
      if (!BLOCKING.has(impact)) {
        testInfo.annotations.push({ type: `${impact} ${violation.id}`, description: target });
        continue;
      }
      if (EXCEPTIONS.some((e) => e.rule === violation.id && e.target === target)) continue;
      blocking.push(`${impact} ${violation.id} (${violation.help}) at ${target}`);
    }
  }
  expect(blocking, 'serious or critical axe violations').toEqual([]);
}

test.describe('signed out', () => {
  for (const path of SIGNED_OUT) {
    test(path, async ({ page }, testInfo) => {
      await page.goto(path);
      await settle(page, path);
      await audit(page, testInfo);
    });
  }
});

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  test.describe(role, () => {
    for (const path of [...SCREENS[role], ...EVERY_ROLE]) {
      test(path, async ({ page }, testInfo) => {
        await signIn(page, ACCOUNTS[role]);
        await go(page, path);
        await settle(page, path);
        await audit(page, testInfo);
      });
    }

    if (role !== 'donor') return;

    // the screen only opens with the post response in route state
    test('/donor/posted', async ({ page }, testInfo) => {
      await signIn(page, ACCOUNTS.donor);
      await go(page, '/donor/post');
      await settle(page, '/donor/post');
      await page.getByLabel('What is it?').fill('Bread rolls');
      await page.getByLabel('How much, in kilograms?').fill('12');
      await page.getByRole('button', { name: 'Post it' }).click();
      await settle(page, '/donor/posted');
      await audit(page, testInfo);
    });
  });
}
