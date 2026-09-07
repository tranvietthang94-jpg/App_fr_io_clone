import { test, expect, Page, APIRequestContext, Browser } from '@playwright/test';
import fs from 'fs';
import {
  getSharedUser,
  seedSession,
  createProjectViaUi,
  openProjectByName,
  uploadTestClip,
  waitVideoReady,
  latestVideoId,
} from './helpers';

test.describe.serial('Export', () => {
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
    const request: APIRequestContext = context.request;

    const user = getSharedUser();
    const token = user.token;
    await seedSession(page, user, token);

    await page.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E Export ${Date.now()}`;
    await createProjectViaUi(page, name);
    const projectId = await openProjectByName(page, name);

    await uploadTestClip(page);
    await page.waitForTimeout(1500);
    const videoId = await latestVideoId(request, token, projectId);
    const status = await waitVideoReady(request, token, videoId);
    if (status !== 'ready') throw new Error(`video never became ready: ${status}`);

    await page.goto(`/projects/${projectId}/videos/${videoId}`, { waitUntil: 'networkidle' });
    await page.locator('video').first().waitFor({ timeout: 15000 });
  });

  test('7.1.1 + 7.1.2 export XML downloads a well-formed file', async () => {
    await page.getByRole('button', { name: 'Xuất XML' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.getByRole('button', { name: 'Tải xuống XML', exact: true }).click(),
    ]);
    const filePath = await download.path();
    const content = fs.readFileSync(filePath!, 'utf8');
    expect(content.trim().startsWith('<')).toBe(true);
    expect(content.length).toBeGreaterThan(50);
    // Real well-formedness check: for 'application/xml', DOMParser reports any
    // parse problem (unclosed tag, mismatched tag, ...) in a <parsererror>
    // node instead of throwing. A missing </sequence> used to slip past the
    // startsWith('<') check above.
    const parseError = await page.evaluate(
      (xml: string) => {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        return doc.querySelector('parsererror')?.textContent ?? null;
      },
      content,
    );
    expect(parseError).toBeNull();
  });

  test('7.2.1 + 7.2.2 export PDF downloads a valid PDF', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.getByRole('button', { name: 'Tải xuống PDF', exact: true }).click(),
    ]);
    const filePath = await download.path();
    const buf = fs.readFileSync(filePath!);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  test.afterAll(async () => {
    await page?.context()?.close();
  });
});
