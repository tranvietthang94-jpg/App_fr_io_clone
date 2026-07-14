import { request as playwrightRequest } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { API_URL, uniqueUser, TestUser } from './helpers';

// /api/auth/register and /api/auth/login are rate-limited to 5 requests/min
// per IP (apps/api/src/auth/auth.controller.ts) — a real, intentional
// anti-abuse limit, not a bug. Registering a fresh user per test/spec file
// blows through that budget once more than ~5 specs need "a logged-in user"
// in the same run. Register ONE shared user here, once, and have every spec
// file that just needs to be logged in (not testing register/login itself)
// reuse it via getSharedUser() in helpers.ts.
const SHARED_USER_FILE = path.join(__dirname, '.shared-user.json');

export default async function globalSetup() {
  const user = uniqueUser('shared');
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${API_URL}/api/auth/register`, { data: user });
  if (!res.ok()) {
    throw new Error(`global-setup: failed to register shared user: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const record: TestUser & { token: string } = { ...user, token: body.accessToken };
  fs.writeFileSync(SHARED_USER_FILE, JSON.stringify(record, null, 2));
  await ctx.dispose();
}
