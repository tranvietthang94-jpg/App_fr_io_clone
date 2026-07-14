import { test, expect, Page } from '@playwright/test';
import { getSharedUser, seedSession, createProjectViaUi, openProjectByName } from './helpers';

// Phase 5: the file browser page header (5 action buttons) had the same
// no-wrap bug found and fixed on the video review pages in Phase 3/4.
test.describe('Dashboard / file browser — responsive layout', () => {
  let page: Page;
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    const user = getSharedUser();
    await seedSession(page, user, user.token);

    await page.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E DashResp ${Date.now()}`;
    await createProjectViaUi(page, name);
    projectId = await openProjectByName(page, name);
  });

  test('file browser header buttons stay within the viewport at 375px', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });

    for (const label of ['Thành viên', 'Cài đặt dự án', 'Thùng rác', 'Tạo thư mục mới']) {
      const box = await page.locator(`[aria-label="${label}"]`).first().boundingBox();
      expect(box, `button "${label}" not found`).toBeTruthy();
      expect(box!.x + box!.width, `button "${label}" overflows`).toBeLessThanOrEqual(375);
    }
  });

  test('icon-only header buttons keep an accessible name at 375px (text hidden via CSS, not removed)', async () => {
    // Regression guard for the specific mistake made while adding `hidden
    // sm:inline` to button labels: display:none removes text from the
    // accessibility tree too, so icon-only buttons need an explicit
    // aria-label, not just visually-hidden text.
    for (const label of ['Thành viên', 'Thùng rác']) {
      const btn = page.getByRole('button', { name: label });
      await expect(btn).toBeVisible();
    }
  });

  test('no horizontal overflow on /projects, file browser, or settings at 375px', async () => {
    for (const url of ['/projects', `/projects/${projectId}`, `/projects/${projectId}/settings`]) {
      await page.goto(url, { waitUntil: 'networkidle' });
      const hasHScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(hasHScroll, `${url} has horizontal overflow at 375px`).toBe(false);
    }
  });

  test('MembersPanel dialog stays within the viewport at 375px', async () => {
    await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    await page.locator('[aria-label="Thành viên"]').click();
    await expect(page.locator('text=Thành viên dự án')).toBeVisible();
    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHScroll).toBe(false);
  });

  test.afterAll(async () => {
    await page?.context()?.close();
  });
});
