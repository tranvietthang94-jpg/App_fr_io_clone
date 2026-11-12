import { test, expect } from '@playwright/test';
import {
  API_URL,
  getSharedUser,
  seedSession,
  createProjectViaUi,
  openProjectByName,
  uploadTestClip,
  latestVideoId,
  waitVideoReady,
} from './helpers';

// Computed-colour checks for the design tokens (primary red, success, brand).
test.describe('design tokens', () => {
  test('primary button is #EF4444 and the wordmark dot is brand #10B981', async ({ page }) => {
    const user = getSharedUser();
    await seedSession(page, user, user.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Tạo dự án mới' }).first()).toHaveCSS(
      'background-color',
      'rgb(239, 68, 68)',
    );
    await expect(page.locator('a[href="/projects"] > span.rounded-full').first()).toHaveCSS(
      'background-color',
      'rgb(16, 185, 129)',
    );
  });

  test('an approved review-status chip on a video card is success #22C55E', async ({ page, request }) => {
    test.setTimeout(120_000);
    const user = getSharedUser();
    await seedSession(page, user, user.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E Tokens ${Date.now()}`;
    await createProjectViaUi(page, name);
    const projectId = await openProjectByName(page, name);
    await uploadTestClip(page);
    const videoId = await latestVideoId(request, user.token, projectId);
    await waitVideoReady(request, user.token, videoId);
    const res = await request.patch(`${API_URL}/api/videos/${videoId}/review-status`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { status: 'approved' },
    });
    expect(res.ok()).toBeTruthy();
    await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('div.rounded-full', { hasText: 'Đã duyệt' }).first()).toHaveCSS('color', 'rgb(34, 197, 94)');
  });

  test('destructive buttons are outlined, the final confirm is solid, focus ring is primary', async ({ page, request }) => {
    test.setTimeout(120_000);
    const user = getSharedUser();
    await seedSession(page, user, user.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });

    // focus ring: keyboard-focused primary button shows a 2px primary ring
    const create = page.getByRole('button', { name: 'Tạo dự án mới' }).first();
    await page.keyboard.press('Tab');
    await create.focus();
    await expect(create).toHaveCSS('box-shadow', /rgb\(239, 68, 68\) 0px 0px 0px 4px/);

    const name = `E2E Destructive ${Date.now()}`;
    await createProjectViaUi(page, name);
    const projectId = await openProjectByName(page, name);
    await uploadTestClip(page);
    await waitVideoReady(request, user.token, await latestVideoId(request, user.token, projectId));
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Tùy chọn video' }).first().click();
    await page.getByRole('menuitem', { name: 'Xoá vĩnh viễn' }).click();
    const dialog = page.getByRole('dialog');
    const next = dialog.getByRole('button', { name: 'Tiếp tục' });
    await expect(next).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(next).toHaveCSS('border-top-color', 'rgb(127, 29, 29)');
    await next.click();
    await expect(dialog.getByRole('button', { name: 'Xoá vĩnh viễn' })).toHaveCSS('background-color', 'rgb(185, 28, 28)');
  });
});
