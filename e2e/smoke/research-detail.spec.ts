import { expect, test, type Page } from '@playwright/test';
import { expectVisibleRoot, gotoAndStabilize, reloadAndStabilize } from '../helpers/assertions';
import { invalidResearchRoutes, researchRoutes } from '../helpers/routes';

async function expectResearchDetailSurface(page: Page) {
  await expectVisibleRoot(page, 'research-detail-page');
  await expect(page.locator('.research-detail-hero')).toBeVisible();
}

async function expectResearchDetailReady(page: Page) {
  await expectResearchDetailSurface(page);
  await expect(page.locator('.risk-loading-state')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.research-detail-layout, .research-empty-state, .source-summary-bar').first()).toBeVisible({
    timeout: 15000,
  });
}

async function expectResearchDetailFallback(page: Page) {
  await expectResearchDetailSurface(page);
  await expect(page.locator('.risk-loading-state')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.research-detail-layout, .research-empty-state, .source-summary-bar').first()).toBeVisible({
    timeout: 15000,
  });
}

async function expectResearchDetailHeroReady(page: Page) {
  await expectResearchDetailSurface(page);
  await expect(page.locator('.risk-loading-state')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.research-detail-hero h1')).toBeVisible();
}

test.describe('research detail smoke', () => {
  test('backtest detail route is reachable and survives reload', async ({ page }) => {
    await gotoAndStabilize(page, researchRoutes.backtest);
    await expectResearchDetailReady(page);
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE/);

    await reloadAndStabilize(page);
    await expectResearchDetailReady(page);
    await expect(page).toHaveURL(/\/research\/backtest\/VOL_SURGE/);
  });

  test('factor ic detail route is reachable', async ({ page }) => {
    await gotoAndStabilize(page, researchRoutes.factorIc);
    await expectResearchDetailReady(page);
    await expect(page).toHaveURL(/\/research\/factor-ic\/VR/);
  });

  test('attribution detail route is reachable', async ({ page }) => {
    await gotoAndStabilize(page, researchRoutes.attribution);
    await expectResearchDetailReady(page);
    await expect(page).toHaveURL(/\/research\/attribution\/VOL_SURGE/);
  });

  test('resonance detail route is reachable', async ({ page }) => {
    await gotoAndStabilize(page, researchRoutes.resonance);
    await expectResearchDetailHeroReady(page);
    await expect(page).toHaveURL(/\/research\/resonance\//);
  });

  test('invalid detail tab falls back to /research', async ({ page }) => {
    await gotoAndStabilize(page, invalidResearchRoutes.detailTab);
    await expectVisibleRoot(page, 'research-page');
    await expect(page).toHaveURL(/\/research$/);
  });

  for (const path of [
    invalidResearchRoutes.backtestKey,
    invalidResearchRoutes.factorIcKey,
    invalidResearchRoutes.attributionKey,
    invalidResearchRoutes.resonanceKey,
  ]) {
    test(`invalid detail key does not crash: ${path}`, async ({ page }) => {
      await gotoAndStabilize(page, path);
      if (path === invalidResearchRoutes.resonanceKey) {
        await expectResearchDetailHeroReady(page);
      } else {
        await expectResearchDetailFallback(page);
      }
      await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }
});
