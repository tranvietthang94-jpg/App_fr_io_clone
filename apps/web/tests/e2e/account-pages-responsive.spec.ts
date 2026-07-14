import { test, expect, Page } from '@playwright/test';
import { getSharedUser, seedSession } from './helpers';

// Phase 6: auth/account pages didn't have a responsive check yet. These are
// all single centered-card layouts (no multi-button header row like the
// video review / file browser pages), so the only real risk is the card
// overflowing a narrow viewport.
const BREAKPOINTS = [375, 768, 1024, 1440];

async function assertNoHorizontalOverflow(page: Page, url: string) {
  for (const width of BREAKPOINTS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle' });
    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHScroll, `${url} has horizontal overflow at ${width}px`).toBe(false);
  }
}

test.describe('Account pages — responsive layout', () => {
  test('login, register, forgot-password have no horizontal overflow', async ({ page }) => {
    for (const url of ['/login', '/register', '/forgot-password']) {
      await assertNoHorizontalOverflow(page, url);
    }
  });

  test('reset-password and invite (unauthenticated) have no horizontal overflow', async ({ page }) => {
    for (const url of ['/reset-password/some-token', '/invite/some-token']) {
      await assertNoHorizontalOverflow(page, url);
    }
  });

  test('settings/profile has no horizontal overflow while authenticated', async ({ page }) => {
    const shared = getSharedUser();
    await seedSession(page, shared, shared.token);
    await assertNoHorizontalOverflow(page, '/settings/profile');
  });
});
