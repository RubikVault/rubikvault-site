import { test, expect } from '@playwright/test';

test('ops render stamp goes ok', async ({ page }) => {
  await page.goto('/ops', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ops-render-status[data-status="ok"]', { timeout: 20000 });
  const render = page.locator('#ops-render-status');
  await expect(render).toHaveAttribute('data-reason', 'rendered');
  const asof = await render.getAttribute('data-asof');
  expect(asof).toBeTruthy();
});

test('ops truth-chain sections render', async ({ page }) => {
  const responsePromise = page.waitForResponse((resp) => {
    return resp.url().includes('/api/mission-control/summary') && resp.status() === 200;
  });
  await page.goto('/ops', { waitUntil: 'domcontentloaded' });
  await responsePromise;

  await expect(page.locator('[data-testid="truth-chain"]')).toBeVisible();
  await expect(page.locator('[data-testid="scheduler-card"]')).toBeVisible();

  const rawPre = page.locator('#ops-raw-json-pre');
  // Raw JSON panel may be collapsed/hidden by design; require it exists and is populated.
  await expect(rawPre).toBeAttached();
  await page.waitForFunction(() => {
    const el = document.querySelector('#ops-raw-json-pre');
    const t = el?.textContent || '';
    return t.trim().length > 50;
  }, { timeout: 20000 });

  const text = await rawPre.textContent();
  expect((text || '').length).toBeGreaterThan(50);
});
