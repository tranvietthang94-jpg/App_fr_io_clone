import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  API_URL,
  getSharedUser,
  seedSession,
  createProjectViaUi,
  openProjectByName,
  uploadTestClip,
  uniqueUser,
} from './helpers';

/**
 * Storage usage bar + quota refusal in the upload queue.
 *
 * Required environment (documented, not skipped — a missing setting fails loudly):
 *  - the API under test runs with SUPER_ADMIN_USER_ID set (apps/api/.env), and
 *  - E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD are the login of THAT account.
 * The super admin is used only to set a quota on a throwaway user, through
 * PATCH /api/admin/users/:id/quota. Logging in costs one of the 5 logins/min the API allows.
 */
const CLIP = path.join(__dirname, 'fixtures', 'test-clip.mp4');
const CLIP_BYTES = fs.statSync(CLIP).size;

const usageBar = (page: Page) => page.getByRole('progressbar', { name: 'Dung lượng lưu trữ' });

test.describe.serial('Storage quota', () => {
  test('sidebar shows usage after upload', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const shared = getSharedUser();
    await seedSession(page, shared, shared.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });

    await expect(usageBar(page)).toBeVisible();
    await expect(page.getByText(/Đã dùng .* \/ 15 GB/)).toBeVisible();
    const before = Number(await usageBar(page).getAttribute('aria-valuenow'));

    const name = `E2E Quota ${Date.now()}`;
    await createProjectViaUi(page, name);
    await openProjectByName(page, name);
    await uploadTestClip(page);

    // The bar refreshes itself when the upload completes; aria-valuenow carries the exact byte count.
    await expect(usageBar(page)).toHaveAttribute('aria-valuenow', String(before + CLIP_BYTES));
    await context.close();
  });

  test('upload over quota shows "Còn trống" message and no retry', async ({ browser, request }) => {
    const email = process.env.E2E_SUPER_ADMIN_EMAIL;
    const password = process.env.E2E_SUPER_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error('storage-quota.spec needs E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD (see the spec header)');
    }
    const login = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
    expect(login.ok(), `super admin login failed: ${login.status()}`).toBeTruthy();
    const superToken = (await login.json()).accessToken as string;

    // Throwaway user with a quota smaller than the clip, so nothing shared is left limited.
    const user = uniqueUser('quota');
    const reg = await request.post(`${API_URL}/api/auth/register`, { data: user });
    expect(reg.ok()).toBeTruthy();
    const { accessToken, user: created } = await reg.json();
    const patch = await request.patch(`${API_URL}/api/admin/users/${created.id}/quota`, {
      headers: { Authorization: `Bearer ${superToken}` },
      data: { quotaBytes: 10 },
    });
    expect(patch.ok(), `set quota failed: ${patch.status()} ${await patch.text()}`).toBeTruthy();

    const context = await browser.newContext();
    const page = await context.newPage();
    await seedSession(page, user, accessToken);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E Quota refuse ${Date.now()}`;
    await createProjectViaUi(page, name);
    await openProjectByName(page, name);

    await page.setInputFiles('input[type=file]', CLIP);
    const message = page.getByText(/^Còn trống .* — liên hệ admin để nâng dung lượng$/);
    await expect(message).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
    await context.close();
  });
});
