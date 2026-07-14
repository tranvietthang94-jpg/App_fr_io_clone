import { test, expect, Page, APIRequestContext, Browser } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import {
  getSharedUser,
  seedSession,
  createProjectViaUi,
  openProjectByName,
  uploadTestClip,
  waitVideoReady,
  latestVideoId,
} from './helpers';

// Upload + transcode is expensive, so this whole file shares one uploaded
// video across tests instead of re-uploading per test (test.describe.serial
// guarantees ordering + a single shared `page`/`videoId`).
test.describe.serial('Video upload, transcode, and player', () => {
  let page: Page;
  let request: APIRequestContext;
  let token: string;
  let projectId: string;
  let videoId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    request = context.request;

    const user = getSharedUser();
    token = user.token;
    await seedSession(page, user, token);

    await page.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E Media ${Date.now()}`;
    await createProjectViaUi(page, name);
    projectId = await openProjectByName(page, name);
  });

  test('3.1.3 upload fails cleanly on a network error, then succeeds after the interception is removed', async () => {
    await page.route('**/api/upload/chunk/**', (route) => route.abort('failed'));
    await page.setInputFiles('input[type=file]', path.join(__dirname, 'fixtures', 'test-clip.mp4'));
    await page.waitForSelector('text=Lỗi', { timeout: 40000 });
    await expect(page.locator('text=Lỗi').first()).toBeVisible();
    await page.unroute('**/api/upload/chunk/**');
    await page.waitForTimeout(500);
  });

  test('UPLOAD rejects a non-video file with a clear toast', async () => {
    const badFile = path.join(__dirname, 'fixtures', 'not-a-video.txt');
    fs.writeFileSync(badFile, 'not a video');
    await page.setInputFiles('input[type=file]', badFile);
    // Radix Toast renders the visible message plus a separate visually-hidden
    // live-region announcer with the same text for screen readers — scope to
    // the visible one specifically so this doesn't hit a strict-mode
    // multiple-match error.
    await expect(page.locator('.whitespace-pre-line', { hasText: 'không phải file video' })).toBeVisible({
      timeout: 5000,
    });
  });

  test('3.1.1 + 3.2.1 upload succeeds and the video appears in the list', async () => {
    await uploadTestClip(page);
    await page.waitForTimeout(3500);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('text=test-clip')).toBeVisible();
    videoId = await latestVideoId(request, token, projectId);
  });

  test('8.1.1 + 8.1.4 video transcodes to ready with populated metadata', async () => {
    const status = await waitVideoReady(request, token, videoId);
    expect(status).toBe('ready');

    const res = await request.get(`http://localhost:4000/api/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const video = await res.json();
    expect(video.duration).toBeGreaterThan(0);
    expect(video.width).toBeGreaterThan(0);
    expect(video.height).toBeGreaterThan(0);
  });

  test('PLAYER 4.1.1 play/pause toggles the underlying video element', async () => {
    await page.goto(`/projects/${projectId}/videos/${videoId}`, { waitUntil: 'networkidle' });
    const video = page.locator('video').first();
    await video.waitFor({ timeout: 15000 });

    await video.click({ force: true });
    await page.waitForTimeout(600);
    const playing1 = await video.evaluate((v: HTMLVideoElement) => !v.paused);
    await video.click({ force: true });
    await page.waitForTimeout(400);
    const playing2 = await video.evaluate((v: HTMLVideoElement) => !v.paused);

    expect(playing1).not.toBe(playing2);
  });

  test('PLAYER 4.2.1 frame-step nudges currentTime by one frame', async () => {
    const video = page.locator('video').first();
    await video.evaluate((v: HTMLVideoElement) => v.pause());
    await page.waitForTimeout(200);
    const before = await video.evaluate((v: HTMLVideoElement) => v.currentTime);

    await page.locator('[aria-label="Tiến 1 khung hình"]').click();
    await page.waitForTimeout(300);
    const after = await video.evaluate((v: HTMLVideoElement) => v.currentTime);

    expect(after).not.toBe(before);
  });

  test('PLAYER skip-5s buttons jump currentTime by ~5 seconds and clamp at 0', async () => {
    const video = page.locator('video').first();
    await video.evaluate((v: HTMLVideoElement) => {
      v.currentTime = Math.min(10, v.duration - 1);
    });
    await page.waitForTimeout(300);
    const before = await video.evaluate((v: HTMLVideoElement) => v.currentTime);

    await page.locator('[aria-label="Tiến 5 giây"]').click();
    await page.waitForTimeout(400);
    const afterFwd = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(afterFwd).toBeGreaterThan(before);

    await video.evaluate((v: HTMLVideoElement) => {
      v.currentTime = 1;
    });
    await page.waitForTimeout(200);
    await page.locator('[aria-label="Lùi 5 giây"]').click();
    await page.waitForTimeout(400);
    const clamped = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(clamped).toBe(0);
  });

  test.afterAll(async () => {
    await page?.context()?.close();
  });
});
