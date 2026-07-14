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

test.describe.serial('Comments and annotations', () => {
  let page: Page;
  let videoId: string;
  let projectId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    const request: APIRequestContext = context.request;

    const user = getSharedUser();
    const token = user.token;
    await seedSession(page, user, token);

    await page.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E Comments ${Date.now()}`;
    await createProjectViaUi(page, name);
    projectId = await openProjectByName(page, name);

    await uploadTestClip(page);
    await page.waitForTimeout(1500);
    videoId = await latestVideoId(request, token, projectId);
    const status = await waitVideoReady(request, token, videoId);
    if (status !== 'ready') throw new Error(`video never became ready: ${status}`);

    await page.goto(`/projects/${projectId}/videos/${videoId}`, { waitUntil: 'networkidle' });
    await page.locator('video').first().waitFor({ timeout: 15000 });
  });

  test('5.1.2 empty comment is blocked (submit disabled)', async () => {
    const input = page.locator('[placeholder="Thêm bình luận..."]');
    await input.waitFor({ timeout: 8000 });
    const form = input.locator('xpath=ancestor::form[1]');
    await expect(form.locator('button[type=submit]')).toBeDisabled();
  });

  const commentText = `E2E comment ${Date.now()}`;

  test('5.1.1 add comment at current timestamp shows in the panel', async () => {
    const input = page.locator('[placeholder="Thêm bình luận..."]');
    await input.click();
    await input.fill(commentText);
    const form = input.locator('xpath=ancestor::form[1]');
    await form.locator('button[type=submit]').click();
    // Scoped to the active tab panel: the Export tab is now `forceMount`ed
    // alongside Comments (so switching tabs doesn't drop CommentPanel's
    // in-progress state — see Tabs.tsx), and its live XML preview embeds
    // comment text too, so an unscoped page-wide locator matches both.
    await expect(
      page.locator('[role="tabpanel"][data-state="active"]').getByText(commentText, { exact: true })
    ).toBeVisible({ timeout: 5000 });
  });

  test('5.2.3 a marker appears on the timeline for the new comment', async () => {
    await expect(page.locator('[class*="accent-yellow"]').first()).toBeVisible();
  });

  test('5.3.1 delete comment removes it', async () => {
    await page.locator('[aria-label="Xóa bình luận"]').first().click();
    await page.waitForTimeout(300);
    const confirmBtn = page.locator('button:has-text("Xóa")').last();
    if (await confirmBtn.count()) await confirmBtn.click();
    await expect(
      page.locator('[role="tabpanel"][data-state="active"]').getByText(commentText, { exact: true })
    ).toHaveCount(0, { timeout: 5000 });
  });

  test('an unsent comment draft survives switching to the Export tab and back', async () => {
    // Regression guard: the Comments/Export panel merge (Phase 3) put both
    // behind Radix Tabs, which unmounts inactive content by default — that
    // silently wiped CommentPanel's local state (including any unsent
    // draft) on every tab switch. Fixed via `forceMount` + CSS-hidden
    // inactive content (see Tabs.tsx) so the panel just stays mounted.
    const input = page.locator('[placeholder="Thêm bình luận..."]');
    await input.waitFor({ timeout: 8000 });
    const draft = `unsent draft ${Date.now()}`;
    await input.fill(draft);

    await page.getByRole('tab', { name: /Xuất/ }).click();
    await expect(page.locator('text=Xuất báo cáo')).toBeVisible();

    await page.getByRole('tab', { name: /Bình luận/ }).click();
    await expect(input).toHaveValue(draft);
    await input.fill('');
  });

  test('6.1.1 + 6.1.2 enabling draw mode shows the toolbar and a freehand stroke renders', async () => {
    await page.locator('[aria-label="Vẽ chú thích trên video"]').click();
    await expect(page.locator('[aria-label="Vẽ"]')).toBeVisible();

    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const hasInk = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    });
    expect(hasInk).toBe(true);
  });

  test('6.1.5 eraser is enabled for an unsaved stroke and removes it', async () => {
    const eraseBtn = page.locator('[aria-label="Xóa nét gần nhất"]');
    await expect(eraseBtn).toBeEnabled();

    const canvas = page.locator('canvas').first();
    const before = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) count++;
      return count;
    });

    await eraseBtn.click();
    await page.waitForTimeout(300);

    const after = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) count++;
      return count;
    });

    expect(after).toBeLessThan(before);
  });

  test.afterAll(async () => {
    await page?.context()?.close();
  });
});
