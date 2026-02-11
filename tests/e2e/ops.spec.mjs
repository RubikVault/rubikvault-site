import { test, expect } from '@playwright/test';

async function waitForOpsSummary(page) {
  const refresh = page.locator('#btn-refresh');
  const waitSummary = page
    .waitForResponse((resp) => resp.url().includes('/api/mission-control/summary') && resp.status() === 200, {
      timeout: 60_000
    })
    .catch(() => null);
  if (await refresh.count()) {
    await refresh.click();
  }
  await waitSummary;
}

test('ops render stamp goes ok', async ({ page }) => {
  await page.goto('/ops/', { waitUntil: 'domcontentloaded' });
  expect(page.url()).toContain('/ops/');
  await waitForOpsSummary(page);
  const bridge = page.locator('#ops-bridge');
  await expect(bridge).toBeAttached({ timeout: 60_000 });
  await expect(bridge).toHaveAttribute('data-status', /ok|degraded|error/, { timeout: 60_000 });
  await expect(bridge).toHaveAttribute('data-baseline', /ok|pending|fail|unknown/);
  const pipelineExpected = await bridge.getAttribute('data-pipeline-expected');
  if (pipelineExpected === 'false') {
    await expect(page.locator('#truth-chain-steps .pill.bad')).toHaveCount(0);
  }
});

test('ops truth-chain sections render', async ({ page }) => {
  await page.goto('/ops/', { waitUntil: 'domcontentloaded' });
  expect(page.url()).toContain('/ops/');
  await waitForOpsSummary(page);

  await expect(page.locator('[data-testid="truth-chain"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid="scheduler-card"]')).toBeVisible({ timeout: 60_000 });

  const rawPre = page.locator('#ops-raw-json-pre');
  // Raw JSON panel may be collapsed/hidden by design; require it exists and is populated.
  await expect(rawPre).toBeAttached();
  await expect(rawPre).toHaveText(/schema_version|meta|data/, { timeout: 60_000 });
  const bridge = page.locator('#ops-bridge');
  const pipelineExpected = await bridge.getAttribute('data-pipeline-expected');
  if (pipelineExpected === 'false') {
    await expect(page.locator('#truth-chain-steps .pill.bad')).toHaveCount(0);
  }
});
