import { expect, test } from '@playwright/test';
import { expectVisibleRoot, gotoAndStabilize, reloadAndStabilize } from '../helpers/assertions';

test.describe('p1 workflow smoke', () => {
  test('dashboard semantics can enter signals and invalid focus does not crash', async ({ page }) => {
    await gotoAndStabilize(page, '/signals?source=dashboard&tab=buy&focus=300264.SZ');
    await expectVisibleRoot(page, 'signals-page');
    await expect(page).toHaveURL(/\/signals\?source=dashboard&tab=buy&focus=300264\.SZ/);

    await gotoAndStabilize(page, '/signals?source=dashboard&tab=buy&focus=NOTFOUND.SZ');
    await expectVisibleRoot(page, 'signals-page');
    await expect(page.locator('.signals-feedback-banner, .signals-context-empty, .signals-table-shell').first()).toBeVisible();
  });

  test('signals source can enter watchlist with valid focus and grouped view', async ({ page }) => {
    await gotoAndStabilize(page, '/watchlist?source=signals&focus=300264.SZ&strategy=VOL_SURGE&view=group&groupBy=strategy');
    await expectVisibleRoot(page, 'watchlist-page');
    await expect(page).toHaveURL(/\/watchlist\?source=signals/);
  });

  test('signals source watchlist focus miss does not crash', async ({ page }) => {
    await gotoAndStabilize(page, '/watchlist?source=signals&focus=NOTFOUND.SZ&view=table&groupBy=strategy');
    await expectVisibleRoot(page, 'watchlist-page');
    await expect(page.locator('.watchlist-feedback-banner, .watchlist-table-shell, .watchlist-group-shell').first()).toBeVisible();
  });

  test('watchlist source portfolio can restore generated focus portfolioId and section', async ({ page }) => {
    await gotoAndStabilize(page, '/portfolio?source=watchlist&tab=open');
    await expectVisibleRoot(page, 'portfolio-page');

    const firstRow = page.locator('.portfolio-table-row').first();
    await firstRow.click();
    await expect(page).toHaveURL(/focus=/);
    await expect(page).toHaveURL(/portfolioId=/);
    await expect(page).toHaveURL(/section=open/);

    await reloadAndStabilize(page);
    await expectVisibleRoot(page, 'portfolio-page');
    await expect(page).toHaveURL(/portfolioId=/);
  });

  test('watchlist source portfolio invalid values fall back without white screen', async ({ page }) => {
    await gotoAndStabilize(page, '/portfolio?source=watchlist&tab=closed&focus=NOTFOUND.SZ&portfolioId=999999&section=bad');
    await expectVisibleRoot(page, 'portfolio-page');
    await expect(page.locator('.portfolio-feedback, .portfolio-table-shell, .portfolio-empty-state').first()).toBeVisible();
  });

  for (const source of ['dashboard', 'watchlist', 'portfolio', 'risk']) {
    test(`research accepts workflow source: ${source}`, async ({ page }) => {
      const extra = source === 'risk' ? '&risk_level=high' : '';
      await gotoAndStabilize(page, `/research?source=${source}&focus=300264.SZ&strategy=VOL_SURGE${extra}`);
      await expectVisibleRoot(page, 'research-page');
      await expect(page.locator('.research-layout, .research-state-banner, .risk-breakdown-empty').first()).toBeVisible();
    });
  }

  test('system accepts dashboard source with valid api parameter', async ({ page }) => {
    await gotoAndStabilize(page, '/system?source=dashboard&tab=api&api=%2Fapi%2Fdashboard%2Fsummary');
    await expectVisibleRoot(page, 'system-page');
  });

  test('system accepts risk source with valid dataset parameter', async ({ page }) => {
    await gotoAndStabilize(page, '/system?source=risk&tab=coverage&dataset=risk_snapshot');
    await expectVisibleRoot(page, 'system-page');
  });

  test('system accepts execution source with valid step parameter and invalid tab fallback', async ({ page }) => {
    await gotoAndStabilize(page, '/system?source=execution&tab=pipeline&step=ingest_daily');
    await expectVisibleRoot(page, 'system-page');

    await gotoAndStabilize(page, '/system?source=execution&tab=bad-tab&step=unknown_step');
    await expectVisibleRoot(page, 'system-page');
    await expect(page.locator('.page-banner.warning, .empty-state, .system-workspace').first()).toBeVisible();
  });
});
