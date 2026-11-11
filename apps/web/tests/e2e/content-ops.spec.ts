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
  latestVideoId,
  waitVideoReady,
  uniqueUser,
} from './helpers';

/**
 * Copy / duplicate / permanent delete in the project UI, and the access-aware pages.
 *
 * The last test needs a super admin (to grant project_view): the API under test runs with
 * SUPER_ADMIN_USER_ID and E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD are that account's
 * login. A missing setting fails loudly. It costs one login and one register of the 5/min auth budget.
 */
const CLIP = path.join(__dirname, 'fixtures', 'test-clip.mp4');
const CLIP_NAME = 'test-clip.mp4';
const CLIP_BYTES = fs.statSync(CLIP).size;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe.serial('Content ops', () => {
  const shared = getSharedUser();
  let page: Page;
  let projectId = '';
  let targetId = '';
  const projectName = `E2E Ops ${Date.now()}`;
  const targetName = `E2E Ops target ${Date.now()}`;

  const titles = () => page.getByRole('heading', { name: CLIP_NAME });
  const usageBar = () => page.getByRole('progressbar', { name: 'Dung lượng lưu trữ' });
  const openCardMenu = async (item: RegExp | string) => {
    await page.getByRole('button', { name: 'Tùy chọn video' }).first().click();
    await page.getByRole('menuitem', { name: item }).click();
  };

  test.beforeAll(async ({ browser, request }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await seedSession(page, shared, shared.token);
    await page.goto('/projects', { waitUntil: 'networkidle' });
    await createProjectViaUi(page, projectName);
    projectId = await openProjectByName(page, projectName);
    await uploadTestClip(page);
    await page.waitForTimeout(1500);
    const videoId = await latestVideoId(request, shared.token, projectId);
    expect(await waitVideoReady(request, shared.token, videoId)).toBe('ready');
    await page.reload({ waitUntil: 'networkidle' });

    const target = await request.post(`${API_URL}/api/projects`, { headers: auth(shared.token), data: { name: targetName } });
    targetId = (await target.json()).id;
  });

  test('duplicate creates a second card with the same title', async () => {
    await expect(titles()).toHaveCount(1);
    await openCardMenu('Nhân bản');
    await expect(titles()).toHaveCount(2);
  });

  test('copy to another project appears there', async ({ request }) => {
    await openCardMenu(/^Copy sang/);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: targetName }).click();
    await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByText('Đã copy video').first()).toBeVisible();

    const list = await request.get(`${API_URL}/api/projects/${targetId}/videos`, { headers: auth(shared.token) });
    const videos = await list.json();
    expect(videos).toHaveLength(1);
    expect(videos[0].title).toBe(CLIP_NAME);
    await expect(titles()).toHaveCount(2); // the source project is unchanged
  });

  test('permanent delete needs both steps and the exact name; pasted name works; storage bar drops', async () => {
    const before = Number(await usageBar().getAttribute('aria-valuenow'));
    await openCardMenu('Xoá vĩnh viễn');

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Xoá vĩnh viễn 1 video \(.*\)\. Không thể khôi phục\./)).toBeVisible();
    await expect(dialog.getByLabel(/Nhập chính xác tên/)).toHaveCount(0); // step 2 is not shown yet
    await dialog.getByRole('button', { name: 'Tiếp tục' }).click();

    const input = dialog.getByLabel(`Nhập chính xác tên "${CLIP_NAME}" để xác nhận`);
    const confirm = dialog.getByRole('button', { name: 'Xoá vĩnh viễn' });
    await expect(confirm).toBeDisabled();
    await input.fill('sai ten');
    await expect(confirm).toBeDisabled();
    await input.fill(`  ${CLIP_NAME}  `); // fill == paste: no paste blocking; surrounding spaces are trimmed
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(titles()).toHaveCount(1);
    await expect(usageBar()).toHaveAttribute('aria-valuenow', String(before - CLIP_BYTES));
  });

  test('view-only admin sees no menu items and no comment composer', async ({ browser, request }) => {
    const email = process.env.E2E_SUPER_ADMIN_EMAIL;
    const password = process.env.E2E_SUPER_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error('content-ops.spec needs E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD (see the spec header)');
    }
    const login = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
    expect(login.ok(), `super admin login failed: ${login.status()}`).toBeTruthy();
    const superToken = (await login.json()).accessToken as string;

    const viewer = uniqueUser('view-admin');
    const reg = await request.post(`${API_URL}/api/auth/register`, { data: viewer });
    expect(reg.ok()).toBeTruthy();
    const { accessToken, user } = await reg.json();
    const grant = await request.patch(`${API_URL}/api/admin/users/${user.id}/permissions`, {
      headers: auth(superToken),
      data: { permissions: ['project_view'] },
    });
    expect(grant.ok(), `grant failed: ${grant.status()}`).toBeTruthy();

    const context = await browser.newContext();
    const viewerPage = await context.newPage();
    await seedSession(viewerPage, viewer, accessToken);
    await viewerPage.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    await expect(viewerPage.getByRole('heading', { name: CLIP_NAME })).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Tùy chọn video' })).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: /Tải video lên|Tải lên/ })).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: 'Tạo thư mục mới' })).toHaveCount(0);

    await viewerPage.getByRole('heading', { name: CLIP_NAME }).click();
    await viewerPage.waitForURL(/\/videos\//);
    await expect(viewerPage.locator('video').first()).toBeVisible({ timeout: 15000 });
    await expect(viewerPage.getByText('Bình luận (', { exact: false }).first()).toBeVisible();
    await expect(viewerPage.getByPlaceholder('Viết nhận xét...')).toHaveCount(0);
    await context.close();
  });
});
