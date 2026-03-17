import { expect, test } from '@playwright/test';
import { expectVisibleRoot, gotoAndStabilize } from '../helpers/assertions';

test.describe('signals non-buy-sell detail smoke', () => {
  test('resonance drawer opens, reopens with another target, and closes without blocking navigation', async ({ page }) => {
    await gotoAndStabilize(page, '/signals?tab=resonance');
    await expectVisibleRoot(page, 'signals-page');

    const detailButtons = page.locator('[data-testid^="signals-detail-open-resonance-"]');
    await expect(detailButtons.nth(1)).toBeVisible({ timeout: 15000 });

    const firstButton = detailButtons.nth(0);
    const secondButton = detailButtons.nth(1);
    const firstTestId = (await firstButton.getAttribute('data-testid')) ?? '';
    const secondTestId = (await secondButton.getAttribute('data-testid')) ?? '';

    await firstButton.click();
    await expect(page.getByTestId('signals-stock-drawer')).toHaveClass(/open/);

    const firstCode = firstTestId.replace('signals-detail-open-resonance-', '');
    const secondCode = secondTestId.replace('signals-detail-open-resonance-', '');

    await expect(page.locator('.drawer-stock-title')).toBeVisible();
    await expect(page.locator('.drawer-header-tags')).toContainText(firstCode);

    await page.getByTestId('signals-stock-drawer-close').click();
    await expect(page.locator('.drawer.open')).toHaveCount(0);

    await secondButton.click();
    await expect(page.getByTestId('signals-stock-drawer')).toHaveClass(/open/);
    await expect(page.locator('.drawer-header-tags')).toContainText(secondCode);
    await expect(page.locator('.drawer-header-tags')).not.toContainText(firstCode);

    await page.getByTestId('signals-stock-drawer-close').click();
    await expect(page.locator('.drawer.open')).toHaveCount(0);

    await page.locator('.sidebar a[href="/watchlist"]').click();
    await expect(page).toHaveURL(/\/watchlist/);
    await expect(page.getByTestId('watchlist-page')).toBeVisible();
  });
});
