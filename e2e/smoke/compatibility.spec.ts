import { expect, test } from '@playwright/test';
import { expectVisibleRoot, gotoAndStabilize } from '../helpers/assertions';

test.describe('research compatibility smoke', () => {
  test('backtest compatibility route redirects to research detail with key', async ({ page }) => {
    await gotoAndStabilize(page, '/backtest?strategy=VOL_SURGE&source=watchlist');
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE/);
  });

  test('backtest compatibility route falls back to research without key', async ({ page }) => {
    await gotoAndStabilize(page, '/backtest?source=watchlist&focus=300264.SZ');
    await expectVisibleRoot(page, 'research-page');
    await expect(page).toHaveURL(/\/research\?source=watchlist&focus=300264\.SZ/);
  });

  for (const source of ['dashboard', 'watchlist', 'portfolio', 'risk']) {
    test(`research accepts source handoff: ${source}`, async ({ page }) => {
      await gotoAndStabilize(page, `/research?source=${source}`);
      await expectVisibleRoot(page, 'research-page');
      await expect(page).toHaveURL(new RegExp(`/research\\?source=${source}`));
    });
  }
});
