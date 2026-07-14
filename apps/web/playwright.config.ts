import { defineConfig, devices } from '@playwright/test';

// Assumes the dev stack is already running locally, same as manual QA in this
// repo: `npm run docker:up` (Postgres/Redis/MinIO) + `npm run dev` (api :4000,
// web :3000) per SETUP.md. Playwright's `webServer` isn't used here because it
// can't orchestrate the docker-compose dependencies the API needs.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  fullyParallel: false, // tests share one seeded user + a small set of resources
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
