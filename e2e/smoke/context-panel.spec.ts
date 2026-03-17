import { expect, test } from '@playwright/test';
import { expectVisibleRoot, gotoAndStabilize } from '../helpers/assertions';
import { expectContextPanelEmpty, expectContextPanelOpen, expectNoGlobalContextPanel } from '../helpers/contextPanel';

test.describe('context panel smoke', () => {
  test('signals opens global context panel for valid focus', async ({ page }) => {
    await gotoAndStabilize(page, '/signals?source=dashboard&tab=buy&focus=300264.SZ');
    await expectVisibleRoot(page, 'signals-page');
    await expectContextPanelOpen(page);
  });

  test('watchlist keeps page-scoped detail panel without global shell for valid focus', async ({ page }) => {
    await gotoAndStabilize(page, '/watchlist?source=signals&focus=300264.SZ&view=table');
    await expectVisibleRoot(page, 'watchlist-page');
    await expectNoGlobalContextPanel(page);
    await expect(page.getByTestId('watchlist-detail-panel')).toBeVisible();
  });

  test('portfolio opens global context panel for active holding', async ({ page }) => {
    await gotoAndStabilize(page, '/portfolio?source=watchlist&tab=open');
    await expectVisibleRoot(page, 'portfolio-page');
    await expectContextPanelOpen(page);
  });

  test('dashboard shows empty panel shell and clears prior panel pollution', async ({ page }) => {
    await gotoAndStabilize(page, '/signals?source=dashboard&tab=buy&focus=300264.SZ');
    await expectContextPanelOpen(page);

    await gotoAndStabilize(page, '/dashboard');
    await expectVisibleRoot(page, 'dashboard-page');
    await expect(page.getByTestId('context-panel')).toHaveCount(0);
    await expectContextPanelEmpty(page);
  });

  test('risk route does not retain global panel after switching from signals', async ({ page }) => {
    await gotoAndStabilize(page, '/signals?source=dashboard&tab=buy&focus=300264.SZ');
    await expectContextPanelOpen(page);

    await gotoAndStabilize(page, '/risk?source=watchlist&focus=300264.SZ&tab=scores');
    await expectVisibleRoot(page, 'risk-page');
    await expectNoGlobalContextPanel(page);
  });

  test('research route does not retain global panel after switching from signals', async ({ page }) => {
    await gotoAndStabilize(page, '/signals?source=dashboard&tab=buy&focus=300264.SZ');
    await expectContextPanelOpen(page);

    await gotoAndStabilize(page, '/research?source=dashboard&focus=300264.SZ&strategy=VOL_SURGE');
    await expectVisibleRoot(page, 'research-page');
    await expectNoGlobalContextPanel(page);
  });

  test('execution route does not retain global panel after switching from portfolio', async ({ page }) => {
    await gotoAndStabilize(page, '/portfolio?source=watchlist&tab=open');
    await expectContextPanelOpen(page);

    await gotoAndStabilize(page, '/execution?source=portfolio&focus=300264.SZ');
    await expectVisibleRoot(page, 'execution-page');
    await expectNoGlobalContextPanel(page);
  });
});
