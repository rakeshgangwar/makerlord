import { expect, test } from '@playwright/test';
import { signIn, GOLDEN, openProject, pickStage } from './helpers.js';

/**
 * Stages are PAGES: the URL carries ?stage= and ?p=, so refresh keeps
 * your place, back/forward walk stages, and links deep-link. This spec
 * pins the two reported bugs: same-URL page switches, and refresh
 * always landing on the inferred (prototype) stage.
 */

test('switching stages changes the URL', async ({ page }) => {
  await openProject(page, GOLDEN);
  await pickStage(page, 7, 'Firmware');
  await expect(page).toHaveURL(/stage=7/);
  await expect(page).toHaveURL(new RegExp(`p=${GOLDEN}`));
  await pickStage(page, 3, 'Requirements');
  await expect(page).toHaveURL(/stage=3/);
});

test('refresh keeps the stage you were on — not the inferred one', async ({ page }) => {
  await openProject(page, GOLDEN);
  await pickStage(page, 7, 'Firmware');
  await page.reload();
  await expect(page).toHaveURL(/stage=7/);
  await expect(page.getByText('⑦ Firmware', { exact: false })).toBeVisible();
});

test('a stage URL deep-links directly', async ({ page }) => {
  await signIn(page);
  await page.goto(`/?p=${GOLDEN}&stage=3`);
  await expect(page.locator('.req-table')).toBeVisible();
});

test('back walks to the previous stage', async ({ page }) => {
  await openProject(page, GOLDEN);
  await pickStage(page, 5, 'Simulate');
  await pickStage(page, 7, 'Firmware');
  await page.goBack();
  await expect(page).toHaveURL(/stage=5/);
  await expect(page.getByText('⑤ Simulate', { exact: false })).toBeVisible();
});
