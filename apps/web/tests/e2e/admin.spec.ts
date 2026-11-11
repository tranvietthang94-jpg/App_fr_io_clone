import { test, expect, APIRequestContext } from '@playwright/test';
import { API_URL, getSharedUser, seedSession, uniqueUser } from './helpers';

/**
 * Admin page.
 *
 * Required environment (a missing setting fails loudly, it does not skip):
 *  - the API under test runs with SUPER_ADMIN_USER_ID set (apps/api/.env), and
 *  - E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD are the login of THAT account.
 * Uses the shared user as the project owner and, temporarily, as an admin with quota_grant
 * (revoked in afterAll), plus one throwaway user. Costs one login and one register of the
 * API's 5/min auth budget.
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe.serial('Admin page', () => {
  const shared = getSharedUser();
  let superToken = '';
  let sharedId = '';
  let target: { email: string; name: string; password: string; id: string; token: string };
  let projectId = '';
  const projectName = `E2E Admin project ${Date.now()}`;

  async function setPermissions(request: APIRequestContext, userId: string, permissions: string[]) {
    const res = await request.patch(`${API_URL}/api/admin/users/${userId}/permissions`, {
      headers: auth(superToken),
      data: { permissions },
    });
    expect(res.ok(), `set permissions failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  }

  test.beforeAll(async ({ request }) => {
    const email = process.env.E2E_SUPER_ADMIN_EMAIL;
    const password = process.env.E2E_SUPER_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error('admin.spec needs E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD (see the spec header)');
    }
    const login = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
    expect(login.ok(), `super admin login failed: ${login.status()}`).toBeTruthy();
    superToken = (await login.json()).accessToken;

    const me = await request.get(`${API_URL}/api/auth/me`, { headers: auth(shared.token) });
    sharedId = (await me.json()).id;

    const user = uniqueUser('admin-target');
    const reg = await request.post(`${API_URL}/api/auth/register`, { data: user });
    expect(reg.ok()).toBeTruthy();
    const body = await reg.json();
    target = { ...user, id: body.user.id, token: body.accessToken };

    const project = await request.post(`${API_URL}/api/projects`, { headers: auth(shared.token), data: { name: projectName } });
    projectId = (await project.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (superToken && sharedId) await setPermissions(request, sharedId, []); // leave the shared user as it was
  });

  test('non-admin is redirected from /admin', async ({ page }) => {
    await seedSession(page, shared, shared.token);
    await page.goto('/admin');
    await page.waitForURL('**/projects', { timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
  });

  test('super admin grants project_view to a user and that user can open another member\'s project read-only', async ({ page, browser, request }) => {
    await seedSession(page, { ...shared, email: process.env.E2E_SUPER_ADMIN_EMAIL! }, superToken);
    await page.goto('/admin');
    await page.getByPlaceholder('Tìm theo tên hoặc email').fill(target.email);
    const row = page.getByRole('row', { name: new RegExp(target.email) });
    await expect(row).toBeVisible();
    await row.focus();
    await page.keyboard.press('Enter'); // rows are keyboard-selectable

    const panel = page.getByRole('region', { name: 'Chi tiết người dùng' });
    await expect(panel).toContainText(target.email);
    const saved = page.waitForResponse((r) => r.url().includes('/permissions') && r.request().method() === 'PATCH');
    await panel.getByLabel('Xem project', { exact: true }).check();
    expect((await saved).ok()).toBeTruthy();
    await expect(panel.getByLabel('Xem project', { exact: true })).toBeChecked();

    // Read-only: the API says so, and the project opens in the UI.
    const access = await request.get(`${API_URL}/api/projects/${projectId}`, { headers: auth(target.token) });
    expect(access.status()).toBe(200);
    const body = await access.json();
    expect(body.myAccess).toMatchObject({ role: null, canInteract: false, canContent: false, canEdit: false, viaAdmin: true });

    const context = await browser.newContext();
    const targetPage = await context.newPage();
    await seedSession(targetPage, target, target.token);
    await targetPage.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    await expect(targetPage.getByText(projectName).first()).toBeVisible();
    await context.close();
  });

  test('admin with quota_grant sets 1 GB for a default user and the table updates', async ({ page, request }) => {
    await setPermissions(request, sharedId, ['quota_grant']);
    await seedSession(page, shared, shared.token);
    await page.goto('/admin');
    await page.getByPlaceholder('Tìm theo tên hoặc email').fill(target.email);
    const row = page.getByRole('row', { name: new RegExp(target.email) });
    await row.click();

    const panel = page.getByRole('region', { name: 'Chi tiết người dùng' });
    // Not super admin: permission checkboxes are visible but disabled.
    await expect(panel.getByLabel('Xem project', { exact: true })).toBeDisabled();

    await panel.getByLabel('Dung lượng (GB)').fill('1');
    const saved = page.waitForResponse((r) => r.url().includes('/quota') && r.request().method() === 'PATCH');
    await panel.getByRole('button', { name: 'Lưu dung lượng' }).click();
    expect((await saved).ok()).toBeTruthy();
    await expect(row).toContainText('1 GB');
  });
});
