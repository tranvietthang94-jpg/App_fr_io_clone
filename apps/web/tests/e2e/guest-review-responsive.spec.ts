import { test, expect, Page, Browser } from '@playwright/test';
import {
  getSharedUser,
  seedSession,
  createProjectViaUi,
  openProjectByName,
  uploadTestClip,
  waitVideoReady,
  latestVideoId,
  API_URL,
} from './helpers';

// Phase 4: same responsive treatment as the authenticated review page
// (video-review-responsive.spec.ts), applied to the public/guest page. This
// page has only one right-hand panel (comments — no export/share for
// guests), so it stacks below `lg` without needing Tabs.
test.describe.serial('Guest review page — responsive layout', () => {
  let guestPage: Page;
  let guestToken: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const user = getSharedUser();
    await seedSession(ownerPage, user, user.token);

    await ownerPage.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E GuestResp ${Date.now()}`;
    await createProjectViaUi(ownerPage, name);
    const projectId = await openProjectByName(ownerPage, name);

    await uploadTestClip(ownerPage);
    await ownerPage.waitForTimeout(1500);
    const videoId = await latestVideoId(ownerContext.request, user.token, projectId);
    const status = await waitVideoReady(ownerContext.request, user.token, videoId);
    if (status !== 'ready') throw new Error(`video never became ready: ${status}`);

    const linkRes = await ownerContext.request.post(`${API_URL}/api/videos/${videoId}/share-links`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { permission: 'can_comment' },
    });
    const link = await linkRes.json();
    guestToken = link.token;
    await ownerContext.close();

    // Fresh, unauthenticated context — the actual guest experience
    const guestContext = await browser.newContext();
    guestPage = await guestContext.newPage();
  });

  test('at 375px there is no horizontal page overflow', async () => {
    await guestPage.setViewportSize({ width: 375, height: 812 });
    await guestPage.goto(`/review/${guestToken}`, { waitUntil: 'networkidle' });
    await guestPage.locator('video').first().waitFor({ timeout: 15000 });

    const hasHScroll = await guestPage.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHScroll).toBe(false);
  });

  test('the shortcuts button stays within the viewport at 375px', async () => {
    const box = await guestPage.locator('[aria-label="Phím tắt"]').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test('"?" opens the keyboard shortcuts dialog', async () => {
    await guestPage.keyboard.press('?');
    await expect(guestPage.locator('text=Phím tắt').first()).toBeVisible();
    await guestPage.keyboard.press('Escape');
  });

  test('side-by-side layout returns at the lg breakpoint (1024px)', async () => {
    await guestPage.setViewportSize({ width: 1024, height: 800 });
    await guestPage.waitForTimeout(200);
    const video = guestPage.locator('video').first();
    const panel = guestPage.locator('[placeholder="Viết nhận xét..."]');
    const videoBox = await video.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(panelBox!.x).toBeGreaterThanOrEqual(videoBox!.x + videoBox!.width - 5);
  });

  test('an unauthenticated guest can still comment (identity prompt still works)', async () => {
    await guestPage.locator('[placeholder="Viết nhận xét..."]').fill('Guest responsive test comment');
    await guestPage.locator('button[type=submit]').last().click();
    await expect(guestPage.locator('text=Giới thiệu bản thân')).toBeVisible({ timeout: 5000 });
  });

  test.afterAll(async () => {
    await guestPage?.context()?.close();
  });
});
