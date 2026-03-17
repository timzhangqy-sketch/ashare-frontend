import { expect, test } from '@playwright/test';
import { expectVisibleRoot, gotoAndStabilize, reloadAndStabilize } from '../helpers/assertions';
import { legacyRoutes } from '../helpers/legacyRoutes';

test.describe('legacy and compatibility routes smoke', () => {
  test('ignition legacy route is reachable', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.ignition);
    await expectVisibleRoot(page, 'ignition-page');
    await expect(page).toHaveURL(/\/ignition$/);

    await reloadAndStabilize(page);
    await expectVisibleRoot(page, 'ignition-page');
    await expect(page).toHaveURL(/\/ignition$/);
  });

  test('ignition legacy route accepts query combinations without crashing', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.ignitionWithQuery);
    await expectVisibleRoot(page, 'ignition-page');
    await expect(page).toHaveURL(/\/ignition\?/);
    await expect(page).toHaveURL(/source=watchlist/);
    await expect(page).toHaveURL(/focus=300264\.SZ/);
  });

  test('holdings legacy route is reachable', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.holdings);
    await expectVisibleRoot(page, 'portfolio-page');
    await expect(page).toHaveURL(/\/portfolio$/);

    await reloadAndStabilize(page);
    await expectVisibleRoot(page, 'portfolio-page');
    await expect(page).toHaveURL(/\/portfolio$/);
  });

  test('holdings legacy route accepts query combinations without crashing', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.holdingsWithQuery);
    await expectVisibleRoot(page, 'portfolio-page');
    await expect(page).toHaveURL(/\/portfolio\?/);
    await expect(page).toHaveURL(/source=dashboard/);
    await expect(page).toHaveURL(/focus=300264\.SZ/);
  });

  test('backtest compatibility accepts strategy key', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.backtestWithStrategy);
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE/);
  });

  test('backtest compatibility accepts explicit detailKey', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.backtestWithDetailKey);
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE/);
  });

  test('backtest compatibility preserves watchlist source on redirect', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.backtestFromWatchlist);
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE\?source=watchlist/);
  });

  test('backtest compatibility preserves portfolio source on detailKey redirect', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.backtestFromPortfolio);
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE\?source=portfolio/);
  });

  test('backtest compatibility preserves execution source on redirect', async ({ page }) => {
    await gotoAndStabilize(page, '/backtest?strategy=VOL_SURGE&source=execution&focus=300264.SZ');
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE\?source=execution/);
    await expect(page).toHaveURL(/focus=300264\.SZ/);
  });

  test('backtest compatibility falls back to research when no key exists', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.backtestRiskNoKey);
    await expectVisibleRoot(page, 'research-page');
    await expect(page).toHaveURL(/\/research\?source=risk/);
  });

  test('backtest compatibility preserves rich query set on no-key fallback', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.backtestRichNoKey);
    await expectVisibleRoot(page, 'research-page');
    await expect(page).toHaveURL(/source=risk/);
    await expect(page).toHaveURL(/focus=300264\.SZ/);
    await expect(page).toHaveURL(/resonance=2/);
    await expect(page).toHaveURL(/risk_level=high/);
    await expect(page).toHaveURL(/trade_date=2026-03-09/);
  });

  test('backtest compatibility preserves rich query set on keyed redirect and survives reload', async ({ page }) => {
    await gotoAndStabilize(page, legacyRoutes.backtestRichWithKey);
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE/);
    await expect(page).toHaveURL(/source=portfolio/);
    await expect(page).toHaveURL(/focus=300264\.SZ/);
    await expect(page).toHaveURL(/resonance=2/);
    await expect(page).toHaveURL(/risk_level=high/);
    await expect(page).toHaveURL(/trade_date=2026-03-09/);

    await reloadAndStabilize(page);
    await expectVisibleRoot(page, 'research-detail-page');
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE/);
  });
});
