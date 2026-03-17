import { expect, type Page } from '@playwright/test';

export async function expectVisibleRoot(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible();
}

export async function expectNoFatalError(page: Page) {
  await expect(page.locator('body')).not.toContainText('Application error');
  await expect(page.locator('body')).not.toContainText('Unexpected Application Error');
  await expect(page.locator('body')).not.toContainText('Failed to fetch dynamically imported module');
}

export async function gotoAndStabilize(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('load');
  await expectNoFatalError(page);
}

export async function reloadAndStabilize(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('load');
  await expectNoFatalError(page);
}
