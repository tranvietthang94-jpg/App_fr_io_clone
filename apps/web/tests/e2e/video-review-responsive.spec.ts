import { test, expect, Page, APIRequestContext, Browser } from '@playwright/test';
import {
  getSharedUser,
  seedSession,
  createProjectViaUi,
  openProjectByName,
  uploadTestClip,
  waitVideoReady,
  latestVideoId,
} from './helpers';

// Phase 3: the video review workspace's dual w-96 side panels had zero
// responsive handling (fixed layout only worked ≥lg) and the header row had
// no wrap, pushing action buttons off-screen below ~600px. Both were
// replaced with a Tabs-driven single panel + a wrapping header.
test.describe.serial('Video review page — responsive layout', () => {
  let page: Page;
  let projectId: string;
  let videoId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    const request: APIRequestContext = context.request;

    const user = getSharedUser();
    await seedSession(page, user, user.token);

    await page.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E Responsive ${Date.now()}`;
    await createProjectViaUi(page, name);
    projectId = await openProjectByName(page, name);

    await uploadTestClip(page);
    await page.waitForTimeout(1500);
    videoId = await latestVideoId(request, user.token, projectId);
    const status = await waitVideoReady(request, user.token, videoId);
    if (status !== 'ready') throw new Error(`video never became ready: ${status}`);
  });

  test('at 375px there is no horizontal page overflow', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects/${projectId}/videos/${videoId}`, { waitUntil: 'networkidle' });
    await page.locator('video').first().waitFor({ timeout: 15000 });

    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHScroll).toBe(false);
  });

  test('header action buttons stay within the viewport at 375px', async () => {
    const shareBtn = page.locator('button:has-text("Chia sẻ")').first();
    const box = await shareBtn.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test('the right panel is a single Tabs region — switching tabs hides the other', async () => {
    await expect(page.locator('[placeholder="Thêm bình luận..."]')).toBeVisible();

    await page.getByRole('tab', { name: /Xuất/ }).click();
    await expect(page.locator('text=Xuất báo cáo')).toBeVisible();
    await expect(page.locator('[placeholder="Thêm bình luận..."]')).not.toBeVisible();

    // header's comment-count button switches back to the comments tab
    await page.getByRole('button', { name: /^\d+$/ }).first().click();
    await expect(page.locator('[placeholder="Thêm bình luận..."]')).toBeVisible();
  });

  test('side-by-side layout returns at the lg breakpoint (1024px)', async () => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.waitForTimeout(200);
    const video = page.locator('video').first();
    const panel = page.locator('[placeholder="Thêm bình luận..."]');
    const videoBox = await video.boundingBox();
    const panelBox = await panel.boundingBox();
    // side-by-side means the panel sits to the right of the video, not below it
    expect(panelBox!.x).toBeGreaterThanOrEqual(videoBox!.x + videoBox!.width - 5);
  });

  test('"?" opens the keyboard shortcuts dialog', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } }); // ensure no input is focused
    await page.keyboard.press('?');
    await expect(page.locator('text=Phím tắt').first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test.afterAll(async () => {
    await page?.context()?.close();
  });
});
