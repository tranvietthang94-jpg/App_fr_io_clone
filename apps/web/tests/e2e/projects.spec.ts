import { test, expect } from '@playwright/test';
import { getSharedUser, seedSession, createProjectViaUi, uniqueUser, registerViaApi } from './helpers';

test.describe('Projects', () => {
  test('2.1.2 empty state shows for a brand-new user', async ({ page, request }) => {
    // Needs a user with zero projects, so this one test registers its own
    // (the shared user accumulates projects across the other tests/files).
    const user = uniqueUser('empty-state');
    const token = await registerViaApi(request, user);
    await seedSession(page, user, token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    await expect(page.locator('text=Chưa có dự án nào')).toBeVisible();
  });

  test.describe('with the shared user', () => {
    test.beforeEach(async ({ page }) => {
      const user = getSharedUser();
      await seedSession(page, user, user.token);
    });

    test('2.2.2 create with an empty name is blocked, modal stays open', async ({ page }) => {
      await page.goto('/projects', { waitUntil: 'networkidle' });
      await page.click('button:has-text("Tạo dự án mới")');
      await page.waitForTimeout(300);
      await page.click('button[type=submit]:has-text("Tạo")');
      await page.waitForTimeout(400);
      await expect(page.locator('text=Tạo dự án mới').first()).toBeVisible();
    });

    test('2.2.1 + 2.1.1 create succeeds and shows in the list', async ({ page }) => {
      await page.goto('/projects', { waitUntil: 'networkidle' });
      const name = `E2E Project ${Date.now()}`;
      await createProjectViaUi(page, name);
      await expect(page.locator(`text=${name}`)).toBeVisible();
    });

    test('2.3.1 delete removes the project from the list', async ({ page }) => {
      await page.goto('/projects', { waitUntil: 'networkidle' });
      const name = `E2E Delete ${Date.now()}`;
      await createProjectViaUi(page, name);

      const card = page.locator('.group', { hasText: name }).first();
      await card.hover();
      await card.locator('[aria-label="Xóa dự án"]').click({ force: true });
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Xóa")').last().click();

      await expect(page.locator(`text=${name}`)).toHaveCount(0, { timeout: 5000 });
    });
  });
});
