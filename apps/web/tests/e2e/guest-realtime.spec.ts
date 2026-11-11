import { test, expect, Page, Browser, APIRequestContext } from '@playwright/test';
import {
  getSharedUser,
  seedSession,
  createProjectViaUi,
  openProjectByName,
  uploadTestClip,
  waitVideoReady,
  latestVideoId,
  API_URL,
} from './helpers';

// Guest sockets must stay connected (and get live comments) on both
// password-protected and open share links — the password has to be sent in
// the socket handshake too, not only on the HTTP calls.
test.describe.serial('Guest realtime over share links', () => {
  const PASSWORD = 'hunter2-e2e';
  let ownerPage: Page;
  let ownerRequest: APIRequestContext;
  let token: string;
  let videoId: string;
  let passwordLink: string;
  let openLink: string;

  const ownerComment = (content: string) =>
    ownerRequest.post(`${API_URL}/api/videos/${videoId}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { content, timestamp: 1, frameNumber: 30 },
    });

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    ownerPage = await ctx.newPage();
    ownerRequest = ctx.request;
    const user = getSharedUser();
    token = user.token;
    await seedSession(ownerPage, user, token);
    await ownerPage.goto('/projects', { waitUntil: 'networkidle' });
    const name = `E2E GuestRT ${Date.now()}`;
    await createProjectViaUi(ownerPage, name);
    const projectId = await openProjectByName(ownerPage, name);
    await uploadTestClip(ownerPage);
    await ownerPage.waitForTimeout(1500);
    videoId = await latestVideoId(ownerRequest, token, projectId);
    const status = await waitVideoReady(ownerRequest, token, videoId);
    if (status !== 'ready') throw new Error(`video never became ready: ${status}`);

    const mkLink = async (data: object) => {
      const res = await ownerRequest.post(`${API_URL}/api/videos/${videoId}/share-links`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { permission: 'can_comment', ...data },
      });
      return (await res.json()).token as string;
    };
    passwordLink = await mkLink({ password: PASSWORD });
    openLink = await mkLink({});

    // Owner stays on the review page so its socket is in the video room.
    await ownerPage.goto(`/projects/${projectId}/videos/${videoId}`, { waitUntil: 'networkidle' });
    await ownerPage.locator('video').first().waitFor({ timeout: 15000 });
  });

  async function guestRoundTrip(browser: Browser, linkToken: string, password?: string) {
    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    try {
      await guest.goto(`/review/${linkToken}`, { waitUntil: 'networkidle' });
      if (password) {
        await guest.locator('input[type=password]').fill('wrong-password');
        await guest.locator('button[type=submit]').click();
        await expect(guest.locator('text=Mật khẩu không đúng')).toBeVisible();
        await guest.locator('input[type=password]').fill(password);
        await guest.locator('button[type=submit]').click();
      }
      await guest.locator('video').first().waitFor({ timeout: 15000 });

      // owner -> guest, live (no reload)
      const fromOwner = `owner says ${Date.now()}`;
      await ownerComment(fromOwner);
      await expect(guest.getByText(fromOwner, { exact: true }).first()).toBeVisible({ timeout: 8000 });

      // guest -> owner, live
      const fromGuest = `guest says ${Date.now()}`;
      await guest.locator('[placeholder="Viết nhận xét..."]').fill(fromGuest);
      await guest.locator('button[type=submit]').last().click();
      await guest.getByRole('dialog').locator('input').first().fill('E2E Guest');
      await guest.getByRole('button', { name: 'Tiếp tục' }).click();
      await expect(
        ownerPage.locator('[role="tabpanel"][data-state="active"]').getByText(fromGuest, { exact: true }),
      ).toBeVisible({ timeout: 8000 });
    } finally {
      await guestCtx.close();
    }
  }

  test('password-protected link: guest socket stays connected, comments flow both ways live', async ({ browser }) => {
    await guestRoundTrip(browser, passwordLink, PASSWORD);
  });

  test('open link: guest socket works unchanged', async ({ browser }) => {
    await guestRoundTrip(browser, openLink);
  });

  test.afterAll(async () => {
    await ownerPage?.context()?.close();
  });
});
