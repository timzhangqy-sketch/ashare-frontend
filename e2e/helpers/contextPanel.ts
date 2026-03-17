import { expect, type Page } from '@playwright/test';

export async function expectContextPanelOpen(page: Page) {
  await expect(page.getByTestId('context-panel')).toBeVisible();
}

export async function expectContextPanelEmpty(page: Page) {
  await expect(page.getByTestId('context-panel-empty')).toBeVisible();
}

export async function expectNoGlobalContextPanel(page: Page) {
  await expect(page.getByTestId('context-panel')).toHaveCount(0);
  await expect(page.getByTestId('context-panel-empty')).toHaveCount(0);
}
