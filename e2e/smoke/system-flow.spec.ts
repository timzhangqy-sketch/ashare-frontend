import { expect, test } from '@playwright/test';
import { expectVisibleRoot, gotoAndStabilize } from '../helpers/assertions';

test.describe('execution and system url restore smoke', () => {
  test('execution accepts portfolio source', async ({ page }) => {
    await gotoAndStabilize(page, '/execution?source=portfolio');
    await expectVisibleRoot(page, 'execution-page');
    await expect(page).toHaveURL(/\/execution\?source=portfolio/);
  });

  test('execution does not crash on invalid tab', async ({ page }) => {
    await gotoAndStabilize(page, '/execution?source=portfolio&tab=bad-tab');
    await expectVisibleRoot(page, 'execution-page');
    await expect(page).toHaveURL(/\/execution/);
  });

  test('system restores api tab from execution source', async ({ page }) => {
    await gotoAndStabilize(page, '/system?source=execution&tab=api');
    await expectVisibleRoot(page, 'system-page');
    await expect(page).toHaveURL(/\/system\?source=execution&tab=api/);
  });

  test('system does not crash on invalid tab', async ({ page }) => {
    await gotoAndStabilize(page, '/system?source=execution&tab=bad-tab');
    await expectVisibleRoot(page, 'system-page');
    await expect(page).toHaveURL(/\/system/);
  });
});
