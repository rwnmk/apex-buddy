import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/data/index.json', r => r.fulfill({ status: 404 }));
    await page.route('**/data/legends.json', r =>
      r.fulfill({ path: 'tests/fixtures/legends.json' })); // relative to the repo root
    await page.goto('/');
    await expect(page.locator('#btn-generate')).toBeEnabled(); // ready signal
    await use(page);
  },
});
export { expect };