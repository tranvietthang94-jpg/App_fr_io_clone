import { test, expect, Page } from '@playwright/test';
import { API_URL, getSharedUser, seedSession } from './helpers';

const KEY = 'rframe.panelCollapsed';
const panel = (page: Page) => page.getByRole('complementary', { name: 'Danh sách dự án' });

test.describe('app shell', () => {
  const shared = getSharedUser();

  test('rail shows the admin item only for admins', async ({ page, request }) => {
    await seedSession(page, shared, shared.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    const rail = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(rail.getByRole('link', { name: 'Dự án' })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);

    const email = process.env.E2E_SUPER_ADMIN_EMAIL;
    const password = process.env.E2E_SUPER_ADMIN_PASSWORD;
    if (!email || !password) throw new Error('shell.spec needs E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD');
    const login = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
    expect(login.ok(), `super admin login failed: ${login.status()}`).toBeTruthy();
    const superToken = (await login.json()).accessToken as string;
    await seedSession(page, { ...shared, email }, superToken);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Quản trị' }),
    ).toBeVisible();
  });

  test('panel collapses with the button and the [ key, and stays collapsed after reload', async ({ page }) => {
    await seedSession(page, shared, shared.token);
    await page.evaluate((k) => localStorage.removeItem(k), KEY);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    await expect(panel(page)).toBeVisible();

    await page.getByRole('button', { name: 'Thu gọn danh sách dự án' }).click();
    await expect(panel(page)).toHaveCount(0);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(panel(page)).toHaveCount(0);

    await page.keyboard.press('[');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('[');
    await expect(panel(page)).toHaveCount(0);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Mở danh sách dự án' }).click();
    await expect(panel(page)).toBeVisible();
  });

  test('[ typed in the search box does not collapse the panel', async ({ page }) => {
    await seedSession(page, shared, shared.token);
    await page.evaluate((k) => localStorage.removeItem(k), KEY);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    const search = panel(page).getByPlaceholder('Tìm dự án');
    await search.click();
    await page.keyboard.type('[');
    await expect(search).toHaveValue('[');
    await expect(panel(page)).toBeVisible();
  });

  // The API throttles at 100 requests/min per IP, so 60 real projects (create + cleanup) would flake the
  // suite: the project list is served from a stubbed GET /api/projects instead.
  test('60 projects: the panel scrolls on its own and search filters to 1', async ({ page }) => {
    const stamp = Date.now();
    const now = new Date().toISOString();
    const projects = Array.from({ length: 60 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: `Shell60 ${stamp} n${i}`,
      description: null,
      ownerId: shared.token,
      createdAt: now,
      updatedAt: now,
    }));
    await page.route('**/api/projects', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: projects }) : route.continue(),
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedSession(page, shared, shared.token);
    await page.evaluate((k) => localStorage.removeItem(k), KEY);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    const list = panel(page).getByTestId('project-list');
    await expect(list.getByRole('link').nth(59)).toBeAttached();
    const scrolls = await list.evaluate(
      (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible',
    );
    expect(scrolls).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);

    await panel(page).getByPlaceholder('Tìm dự án').fill(`Shell60 ${stamp} n37`);
    await expect(list.getByRole('link')).toHaveCount(1);
  });

  test('localStorage throwing still renders the panel expanded and toggling works', async ({ page }) => {
    await page.addInitScript((k) => {
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (key === k) throw new Error('blocked');
        return get.call(this, key);
      };
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === k) throw new Error('blocked');
        return set.call(this, key, value);
      };
    }, KEY);
    await seedSession(page, shared, shared.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    await expect(panel(page)).toBeVisible();
    await page.getByRole('button', { name: 'Thu gọn danh sách dự án' }).click();
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Mở danh sách dự án' }).click();
    await expect(panel(page)).toBeVisible();
  });

  test('375px: bottom bar visible, drawer opens and closes with Esc and overlay, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedSession(page, shared, shared.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    const bar = page.getByRole('navigation', { name: 'Điều hướng dưới' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Dự án' })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Cài đặt' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Thông báo' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Tài khoản' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeHidden();

    await page.getByRole('button', { name: 'Mở menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Danh sách dự án' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mở menu' })).toBeFocused(); // focus goes back to the opener

    await page.getByRole('button', { name: 'Mở menu' }).click();
    await expect(drawer).toBeVisible();
    await page.mouse.click(360, 400); // overlay, right of the 280px drawer
    await expect(drawer).toHaveCount(0);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    ).toBe(true);
  });

  test('keyboard: Tab reaches every rail item with a visible primary focus ring', async ({ page }) => {
    await seedSession(page, shared, shared.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    const wanted = new Set(['Dự án', 'Thông báo', 'Cài đặt', 'Dung lượng lưu trữ', 'Tài khoản']);
    const seen = new Set<string>();
    for (let i = 0; i < 25 && seen.size < wanted.size; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          label: el?.getAttribute('aria-label') ?? '',
          inRail: !!el?.closest('nav[aria-label="Điều hướng chính"], [data-rail]'),
          shadow: el ? getComputedStyle(el).boxShadow : '',
        };
      });
      if (info.inRail && wanted.has(info.label)) {
        expect(info.shadow, `${info.label} has no visible focus ring`).toContain('rgb(239, 68, 68)');
        seen.add(info.label);
      }
    }
    expect([...seen].sort()).toEqual([...wanted].sort());
  });
});
