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
});
