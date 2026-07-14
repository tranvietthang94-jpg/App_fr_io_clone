import { APIRequestContext, Page, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const API_URL = 'http://localhost:4000';

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

export function uniqueUser(tag: string): TestUser {
  const id = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return { email: `${id}@e2e.test`, password: 'Password123!', name: `E2E ${tag}` };
}

const SHARED_USER_FILE = path.join(__dirname, '.shared-user.json');

/**
 * The one user registered by global-setup.ts. Use this in every spec file
 * that just needs to already be logged in — only auth.spec.ts's own
 * register/login tests should call registerViaApi/loginViaUi directly,
 * to stay under the backend's 5-req/min throttle on those two endpoints.
 */
export function getSharedUser(): TestUser & { token: string } {
  return JSON.parse(fs.readFileSync(SHARED_USER_FILE, 'utf8'));
}

/** Registers a user directly against the API (faster/more reliable setup than driving the register form for tests that aren't themselves testing auth). */
export async function registerViaApi(request: APIRequestContext, user: TestUser): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/register`, { data: user });
  expect(res.ok(), `register failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.accessToken as string;
}

/** Logs a page in via the real UI form (used by auth.spec.ts and anywhere the login flow itself matters). */
export async function loginViaUi(page: Page, user: TestUser) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/projects', { timeout: 15000 });
}

/** Seeds localStorage with a valid session so a page loads already authenticated, without going through the login form. */
export async function seedSession(page: Page, user: TestUser, token: string) {
  await page.goto('/login'); // need same-origin document before touching localStorage
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: { id: 'e2e', email: user.email, name: user.name },
            accessToken: token,
            isAuthenticated: true,
            hasHydrated: true,
          },
          version: 0,
        })
      );
    },
    { token, user }
  );
}

export async function createProjectViaUi(page: Page, name: string): Promise<void> {
  await page.click('button:has-text("Tạo dự án mới")');
  await page.waitForTimeout(300);
  await page.fill('input[placeholder="Nhập tên dự án"]', name);
  await page.click('button[type=submit]:has-text("Tạo")');
  await page.waitForTimeout(1000);
}

export async function openProjectByName(page: Page, name: string): Promise<string> {
  await page.locator('.group', { hasText: name }).first().click();
  await page.waitForURL(/\/projects\/[a-f0-9-]+$/, { timeout: 8000 });
  const match = page.url().match(/\/projects\/([a-f0-9-]+)$/);
  if (!match) throw new Error(`could not extract projectId from ${page.url()}`);
  return match[1];
}

export async function uploadTestClip(page: Page): Promise<void> {
  const path = require('path').join(__dirname, 'fixtures', 'test-clip.mp4');
  await page.setInputFiles('input[type=file]', path);
  await page.waitForSelector('text=Xong', { timeout: 20000 });
}

export async function waitVideoReady(request: APIRequestContext, token: string, videoId: string): Promise<string> {
  const deadline = Date.now() + 120_000;
  let status = '';
  while (Date.now() < deadline) {
    const res = await request.get(`${API_URL}/api/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    status = body.status;
    if (status === 'ready' || status === 'error') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return status;
}

export async function latestVideoId(request: APIRequestContext, token: string, projectId: string): Promise<string> {
  const res = await request.get(`${API_URL}/api/projects/${projectId}/videos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const videos = await res.json();
  expect(Array.isArray(videos) && videos.length > 0, 'expected at least one video').toBeTruthy();
  return videos.slice().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    .id;
}
