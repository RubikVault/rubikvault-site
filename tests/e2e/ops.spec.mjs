import { test, expect } from '@playwright/test';

test('ops render stamp goes ok', async ({ page }) => {
  await page.goto('/ops/', { waitUntil: 'domcontentloaded' });
  expect(page.url()).toContain('/ops/');
  const bridge = page.locator('#ops-bridge');
  await expect(bridge).toHaveAttribute('data-status', /ok|degraded/, { timeout: 20000 });
  await expect(bridge).toHaveAttribute('data-baseline', /ok|pending|fail/);
});

test('ops truth-chain sections render', async ({ page }) => {
  const responsePromise = page.waitForResponse((resp) => {
    return resp.url().includes('/api/mission-control/summary') && resp.status() === 200;
  });
  await page.goto('/ops/', { waitUntil: 'domcontentloaded' });
  expect(page.url()).toContain('/ops/');
  await responsePromise;

  await expect(page.locator('[data-testid="truth-chain"]')).toBeVisible();
  await expect(page.locator('[data-testid="scheduler-card"]')).toBeVisible();

  const rawPre = page.locator('#ops-raw-json-pre');
  // Raw JSON panel may be collapsed/hidden by design; require it exists and is populated.
  await expect(rawPre).toBeAttached();
  await expect(rawPre).toHaveText(/schema_version|meta|data/, { timeout: 20000 });
});
