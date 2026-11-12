import { test, expect, type Page } from '@playwright/test';

// Pixel baseline for the sign-in screens: restyling the signed-in app must not change them.
const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'forgot-password', path: '/forgot-password' },
  { name: 'reset-password', path: '/reset-password/visual-test-token' },
];
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 375, h: 812 },
];

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }),
      ),
    );
  });
  // drop the caret so a focused input can't blink into the diff
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
}

for (const { w, h } of VIEWPORTS) {
  test.describe(`sign-in screens @ ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const { name, path } of PAGES) {
      test(`${name} matches baseline`, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        await expect(page).toHaveScreenshot(`${name}-${w}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.002,
          animations: 'disabled',
        });
      });
    }
  });
}

test('login submit button is #EF4444', async ({ page }) => {
  await page.goto('/login');
  const submit = page.getByRole('button', { name: 'Đăng nhập', exact: true });
  await expect(submit).toHaveCSS('background-color', 'rgb(239, 68, 68)');
});
