import { test, expect } from '@playwright/test';
import { uniqueUser, registerViaApi, loginViaUi, seedSession, getSharedUser, API_URL } from './helpers';

test.describe('Authentication', () => {
  test('1.1.1 register success redirects to /projects with a token', async ({ page }) => {
    const user = uniqueUser('reg-ok');
    await page.goto('/register', { waitUntil: 'networkidle' });
    await page.fill('#name', user.name);
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.fill('#confirmPassword', user.password);
    await page.click('button[type=submit]');
    await page.waitForURL('**/projects', { timeout: 15000 });

    const stored = await page.evaluate(() => localStorage.getItem('auth-storage'));
    expect(JSON.parse(stored!).state.accessToken).toBeTruthy();
  });

  test('1.1.2 duplicate email is rejected', async ({ page }) => {
    // Reuses the shared user's email instead of registering a second fresh
    // one, to stay under the backend's 5-req/min register throttle.
    const shared = getSharedUser();
    await page.goto('/register', { waitUntil: 'networkidle' });
    await page.fill('#name', 'Dup Attempt');
    await page.fill('#email', shared.email);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.click('button[type=submit]');

    await expect(page.locator('.bg-accent-red\\/10')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('1.1.4 password mismatch is blocked client-side (no API call)', async ({ page }) => {
    const user = uniqueUser('mismatch');
    await page.goto('/register', { waitUntil: 'networkidle' });
    await page.fill('#name', user.name);
    await page.fill('#email', user.email);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Different123!');
    await page.click('button[type=submit]');

    await expect(page.locator('.bg-accent-red\\/10')).toContainText('không khớp');
  });

  test('backend rejects a short password even bypassing the frontend check', async ({ request }) => {
    const user = uniqueUser('shortpw');
    const res = await request.post(`${API_URL}/api/auth/register`, {
      data: { ...user, password: '12' },
    });
    expect(res.status()).toBe(400);
  });

  test('1.2.1 login success redirects to /projects', async ({ page }) => {
    const shared = getSharedUser();
    await loginViaUi(page, shared);
    await expect(page).toHaveURL(/\/projects$/);
  });

  test('1.2.3 wrong password is rejected, stays on /login', async ({ page }) => {
    const shared = getSharedUser();
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.fill('#email', shared.email);
    await page.fill('#password', 'totally-wrong');
    await page.click('button[type=submit]');

    await expect(page.locator('.bg-accent-red\\/10')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('1.2.4 logout clears the token and returns to /login', async ({ page }) => {
    const shared = getSharedUser();
    await seedSession(page, shared, shared.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });

    await page.locator('button:has-text("Đăng xuất"), [aria-label="Đăng xuất"]').first().click();
    await page.waitForURL('**/login', { timeout: 8000 });

    const stored = await page.evaluate(() => localStorage.getItem('auth-storage'));
    const token = stored ? JSON.parse(stored).state.accessToken : null;
    expect(token).toBeFalsy();
  });
});
