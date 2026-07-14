import { test, expect, Page } from '@playwright/test';
import { getSharedUser, seedSession, loginViaUi, API_URL, TestUser } from './helpers';

// Phase 6: auth utility pages (forgot/reset password, Google OAuth callback,
// invite accept) and the account settings page previously had zero coverage.

test.describe('Forgot / reset password', () => {
  test('forgot-password always shows the same confirmation, valid or not', async ({ page }) => {
    await page.goto('/forgot-password', { waitUntil: 'networkidle' });
    await page.fill('#email', 'no-such-account@e2e.test');
    await page.click('button[type=submit]');
    await expect(page.getByText('Nếu email này tồn tại trong hệ thống')).toBeVisible();
  });

  test('reset-password blocks a mismatched confirmation client-side', async ({ page }) => {
    await page.goto('/reset-password/whatever-token', { waitUntil: 'networkidle' });
    await page.fill('#newPassword', 'Password123!');
    await page.fill('#confirmPassword', 'Different123!');
    await page.click('button[type=submit]');
    await expect(page.locator('.bg-accent-red\\/10')).toContainText('không khớp');
  });

  test('reset-password with an invalid/expired token surfaces the backend error', async ({ page }) => {
    await page.goto('/reset-password/not-a-real-token', { waitUntil: 'networkidle' });
    await page.fill('#newPassword', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.click('button[type=submit]');
    await expect(page.locator('.bg-accent-red\\/10')).toBeVisible();
  });
});

test.describe('Google OAuth callback', () => {
  test('missing accessToken redirects to /login with the mapped error message', async ({ page }) => {
    await page.goto('/auth/google-callback', { waitUntil: 'networkidle' });
    await page.waitForURL('**/login?error=google_failed', { timeout: 8000 });
    await expect(page.getByText('Đăng nhập với Google thất bại')).toBeVisible();
  });
});

test.describe('Invite accept', () => {
  test('unauthenticated visitor is prompted to log in or register', async ({ page }) => {
    await page.goto('/invite/some-token', { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng ký' })).toBeVisible();
    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHScroll).toBe(false);
  });

  test('authenticated visitor with an invalid token sees the backend error', async ({ page }) => {
    const shared = getSharedUser();
    await seedSession(page, shared, shared.token);
    await page.goto('/invite/not-a-real-invite-token', { waitUntil: 'networkidle' });
    await expect(page.locator('.bg-accent-red\\/10')).toBeVisible();
  });
});

test.describe.serial('Account settings', () => {
  // Reuses the shared user (no extra /api/auth/register call — that endpoint
  // is throttled 5 req/min and auth.spec.ts / projects.spec.ts already spend
  // most of that budget) instead of registering a dedicated account. The
  // password-change test reverts the password back at the end so later specs
  // that log the shared user in via loginViaUi(shared) still work.
  let page: Page;
  let shared: TestUser & { token: string };

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    shared = getSharedUser();
    await seedSession(page, shared, shared.token);
  });

  test('updates display name and avatar URL', async ({}) => {
    await page.goto('/settings/profile', { waitUntil: 'networkidle' });
    const nameInput = page.locator('input').first();
    await nameInput.fill('E2E Renamed User');
    await page.locator('input[type=url]').fill('https://example.com/avatar.png');
    await page.click('button:has-text("Lưu hồ sơ")');
    await expect(page.getByText('Đã lưu hồ sơ', { exact: true })).toBeVisible();
  });

  test('rejects a mismatched password change client-side', async ({}) => {
    await page.goto('/settings/profile', { waitUntil: 'networkidle' });
    await page.fill('input[type=password] >> nth=0', shared.password);
    await page.fill('input[type=password] >> nth=1', 'NewPassword123!');
    await page.fill('input[type=password] >> nth=2', 'DifferentPassword123!');
    await page.click('button:has-text("Đổi mật khẩu")');
    await expect(page.getByText('Mật khẩu mới không khớp')).toBeVisible();
  });

  test('changes password, the new password logs in, then reverts to the original', async ({ context }) => {
    const temp = 'TempPassword123!';

    await page.goto('/settings/profile', { waitUntil: 'networkidle' });
    await page.fill('input[type=password] >> nth=0', shared.password);
    await page.fill('input[type=password] >> nth=1', temp);
    await page.fill('input[type=password] >> nth=2', temp);
    await page.click('button:has-text("Đổi mật khẩu")');
    await expect(page.getByText('Đã đổi mật khẩu', { exact: true })).toBeVisible();

    await page.evaluate(() => localStorage.clear());
    await loginViaUi(page, { ...shared, password: temp });

    const stored = await page.evaluate(() => localStorage.getItem('auth-storage'));
    const freshToken = JSON.parse(stored!).state.accessToken as string;
    const revertRes = await context.request.post(`${API_URL}/api/auth/change-password`, {
      headers: { Authorization: `Bearer ${freshToken}` },
      data: { currentPassword: temp, newPassword: shared.password },
    });
    expect(revertRes.ok(), `failed to revert shared user's password: ${revertRes.status()}`).toBeTruthy();
  });

  test.afterAll(async () => {
    await page?.context()?.close();
  });
});
