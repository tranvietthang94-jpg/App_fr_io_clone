import { test, expect, Page, APIRequestContext } from '@playwright/test';
import {
  API_URL,
  getSharedUser,
  seedSession,
  uploadTestClip,
  latestVideoId,
  waitVideoReady,
} from './helpers';

const shared = getSharedUser();
const auth = { Authorization: `Bearer ${shared.token}` };

async function createProject(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post(`${API_URL}/api/projects`, { headers: auth, data: { name } });
  expect(res.ok(), `create project: ${res.status()}`).toBeTruthy();
  return (await res.json()).id;
}

async function createFolder(request: APIRequestContext, projectId: string, name: string, parentFolderId?: string): Promise<string> {
  const res = await request.post(`${API_URL}/api/projects/${projectId}/folders`, {
    headers: auth,
    data: { name, parentFolderId },
  });
  expect(res.ok(), `create folder: ${res.status()}`).toBeTruthy();
  return (await res.json()).id;
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.describe('project page', () => {
  test('opening a folder puts ?folder in the URL; reload and back/forward restore it', async ({ page, request }) => {
    const stamp = Date.now();
    const projectId = await createProject(request, `E2E Folders ${stamp}`);
    const outer = await createFolder(request, projectId, `Outer ${stamp}`);
    const inner = await createFolder(request, projectId, `Inner ${stamp}`, outer);

    await seedSession(page, shared, shared.token);
    await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    await page.getByText(`Outer ${stamp}`, { exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?folder=${outer}$`));
    await page.getByText(`Inner ${stamp}`, { exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`\\?folder=${inner}$`));

    const crumbs = page.getByRole('navigation', { name: 'Đường dẫn thư mục' });
    await expect(crumbs).toContainText(`Outer ${stamp}`);
    await expect(crumbs).toContainText(`Inner ${stamp}`);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(new RegExp(`\\?folder=${inner}$`));
    await expect(crumbs).toContainText(`Outer ${stamp}`);
    await expect(crumbs).toContainText(`Inner ${stamp}`);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`\\?folder=${outer}$`));
    await expect(crumbs).not.toContainText(`Inner ${stamp}`);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`\\?folder=${inner}$`));

    await crumbs.getByRole('button', { name: 'Gốc' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  });

  test('the panel lists top-level folders as ?folder links', async ({ page, request }) => {
    const stamp = Date.now();
    const projectId = await createProject(request, `E2E PanelFolders ${stamp}`);
    const folderId = await createFolder(request, projectId, `Top ${stamp}`);
    await seedSession(page, shared, shared.token);
    await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    const link = page.getByRole('navigation', { name: 'Thư mục' }).getByRole('link', { name: `Top ${stamp}` });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`\\?folder=${folderId}$`));
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Tất cả video' })).toBeVisible();
  });

  test('an unknown or foreign ?folder falls back to the root with at most one toast', async ({ page, request }) => {
    const stamp = Date.now();
    const projectId = await createProject(request, `E2E BadFolder ${stamp}`);
    const otherProject = await createProject(request, `E2E BadFolder other ${stamp}`);
    const foreignFolder = await createFolder(request, otherProject, `Foreign ${stamp}`);
    await seedSession(page, shared, shared.token);

    for (const bad of ['00000000-0000-4000-8000-000000000000', foreignFolder]) {
      await page.goto(`/projects/${projectId}?folder=${bad}`, { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
      await page.waitForTimeout(800);
      expect(await page.locator('li[role="status"]').count()).toBeLessThanOrEqual(1);
    }
  });

  test('long names truncate: full name in title, nothing overflows at 375px', async ({ page, request }) => {
    test.setTimeout(120_000);
    const base = 'Việt Nam – hành trình kỳ diệu của những người yêu điện ảnh và âm nhạc truyền thống ';
    const name = (tag: string) => `${tag} ${base}`.repeat(2).slice(0, 90);
    const projectName = name('Dự án');
    const folderName = name('Thư mục');
    const videoName = name('Video');
    for (const n of [projectName, folderName, videoName]) expect(n).toHaveLength(90);

    const projectId = await createProject(request, projectName);
    await createFolder(request, projectId, folderName);
    await seedSession(page, shared, shared.token);
    await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    await uploadTestClip(page);
    const videoId = await latestVideoId(request, shared.token, projectId);
    await waitVideoReady(request, shared.token, videoId);
    const renamed = await request.patch(`${API_URL}/api/videos/${videoId}`, { headers: auth, data: { title: videoName } });
    expect(renamed.ok()).toBeTruthy();

    for (const [w, h] of [[375, 812], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: videoName })).toBeVisible();
      await expect(page.locator(`h3[title="${videoName}"]`)).toHaveCount(1);
      await expect(page.locator(`main [title="${folderName}"]`).first()).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveAttribute('title', projectName);
      expect(await noHorizontalScroll(page), `${w}px: horizontal scroll`).toBe(true);
      const overflowing = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll('main h1, main h3, main [title]'))
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .map((el) => el.tagName + ':' + (el.getAttribute('title') ?? '').slice(0, 20)),
      );
      expect(overflowing, `${w}px: elements past the viewport`).toEqual([]);
    }

    // the context panel (desktop) truncates the project name too
    const link = page.getByRole('navigation', { name: 'Dự án' }).getByRole('link', { name: projectName });
    await expect(link).toHaveAttribute('title', projectName);
    const [lb, pb] = await Promise.all([
      link.boundingBox(),
      page.getByRole('complementary', { name: 'Danh sách dự án' }).boundingBox(),
    ]);
    expect(lb!.x + lb!.width).toBeLessThanOrEqual(pb!.x + pb!.width + 1);
  });

  test('tab links reach trash, settings and members', async ({ page, request }) => {
    const projectId = await createProject(request, `E2E Tabs ${Date.now()}`);
    await seedSession(page, shared, shared.token);
    await page.goto(`/projects/${projectId}`, { waitUntil: 'networkidle' });
    const tabs = page.getByRole('navigation', { name: 'Mục dự án' });
    await expect(tabs.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-current', 'page');

    await tabs.getByRole('button', { name: 'Thùng rác' }).click();
    await expect(page.getByRole('heading', { name: 'Thùng rác', exact: true })).toBeVisible();
    await expect(tabs.getByRole('button', { name: 'Thùng rác' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('button', { name: 'Video' }).click();
    await expect(page.getByRole('heading', { name: 'Thùng rác', exact: true })).toHaveCount(0);

    await tabs.getByRole('button', { name: 'Thành viên' }).click();
    await expect(page.getByRole('heading', { name: 'Thành viên dự án' })).toBeVisible();
    await page.keyboard.press('Escape');

    await tabs.getByRole('link', { name: 'Cài đặt dự án' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings$`));
  });
});
