import { test, expect } from '@playwright/test';

/**
 * Guest quota-exhaustion wiring, end to end in a real browser.
 *
 * Presets the guest token counter at the configured limit, then proves the
 * app opens the limit modal WITHOUT ever calling the optimize API (no
 * provider quota is spent by this spec). This also exercises the
 * production guard in isUnlimitedMode(): the e2e server is a production
 * build, so a leaked dev flag must not bypass the gate.
 */
test('exhausted guest quota opens the limit modal without calling the provider', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('pp_guest_tokens_used', '50');
  });

  let providerCalls = 0;
  await page.route('**/api/optimize*', async (route) => {
    providerCalls += 1;
    await route.abort();
  });

  await page.goto('/app');
  await page
    .getByPlaceholder(/paste or type your prompt/i)
    .fill('make it better');
  await page.getByRole('button', { name: 'Optimize' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /free optimizations/i }),
  ).toBeVisible();
  expect(providerCalls).toBe(0);
});
