import { expect, test } from '@playwright/test';
import { DANGER, GOLDEN, openProject, pickStage } from './helpers.js';

/**
 * The ⑧ lens (debug spec §9): the seeded golden project carries a live
 * guided search; the danger project has none, so the symptom form shows.
 * Candidates die only by contradiction — the DOM must offer no other way
 * (the §14 sweep covers the no-dismiss regex; here we assert the tree's
 * shape and the D15 ordering).
 */

test('a live search shows ONE proposal in bench type, and the tree', async ({ page }) => {
  await openProject(page, GOLDEN);
  await pickStage(page, 8, 'Debug');
  await expect(page.locator('.proposal')).toHaveCount(1);
  await expect(page.locator('.prop-net')).toContainText('Voltage at');
  // D15: the proposal explains what it separates but shows no predictions
  // for the maker to anchor on before measuring.
  await expect(page.locator('.proposal')).toContainText('separates');
  // The hypothesis tree renders live candidates in plain language.
  await expect(page.locator('.cand.live').first()).toBeVisible();
  await expect(page.getByText('candidates die only by contradiction', { exact: false }))
    .toBeVisible();
});

test('recording the proposed reading prunes and advances the search', async ({ page }) => {
  await openProject(page, GOLDEN);
  await pickStage(page, 8, 'Debug');
  const before = await page.locator('.cand.live').count();
  await page.getByLabel('measured volts').fill('5.0');
  await page.getByRole('button', { name: 'Record' }).click();
  // Something was contradicted (struck through, with its killer named)…
  await expect(page.locator('.cand.dead').first()).toBeVisible();
  await expect(page.locator('.cand.dead').first()).toContainText('contradicted by');
  // …and the search either proposes again or reached a verdict.
  const after = await page.locator('.cand.live').count();
  expect(after).toBeLessThan(before);
});

test('no session yet → the symptom form, not an empty screen', async ({ page }) => {
  await openProject(page, DANGER);
  await pickStage(page, 8, 'Debug');
  await expect(page.getByRole('heading', { name: 'What misbehaves?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /start the search/i })).toBeVisible();
});

test('the shared serial monitor docks in the debug lens too', async ({ page }) => {
  await openProject(page, GOLDEN);
  await pickStage(page, 8, 'Debug');
  await expect(page.getByText('[device output — unverified]')).toBeVisible();
});
