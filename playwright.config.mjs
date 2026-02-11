import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL || process.env.PREVIEW_BASE || 'https://rubikvault.com';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 60_000 },
  reporter: 'list',
  use: {
    baseURL,
    headless: true
  }
});
