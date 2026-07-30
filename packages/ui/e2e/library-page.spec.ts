import { expect, test } from '@playwright/test';
import { GOLDEN } from './helpers.js';

/** The full library & inventory page — the sidebar stays the picker;
 *  this is the browse, with every part honest about its tier. */

test('the library page renders gap, inventory and the tiered catalog', async ({ page }) => {
  await page.goto(`/library?p=${GOLDEN}`);
  await expect(page.getByRole('heading', { name: 'Library & Inventory' })).toBeVisible();
  // The golden build needs parts nobody owns yet — the gap shows them.
  await expect(page.getByText('To acquire')).toBeVisible();
  // The catalog with tier-labelled cards.
  await expect(page.locator('.card').first()).toBeVisible();
  await expect(page.getByText(/whole corpus/)).toBeVisible();
  // Back to the bench keeps the project in the URL.
  await expect(page.getByRole('link', { name: /back to the bench/ }))
    .toHaveAttribute('href', new RegExp(`p=${GOLDEN}`));
});

test('the rail links to the library page', async ({ page }) => {
  await page.goto(`/?p=${GOLDEN}&stage=4`);
  await page.getByRole('link', { name: /library & inventory/ }).click();
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByRole('heading', { name: 'Library & Inventory' })).toBeVisible();
});

test('owning a part from the gap moves it into inventory', async ({ page }) => {
  await page.goto(`/library?p=${GOLDEN}`);
  const gapRows = page.locator('.gap li');
  // count() does not auto-wait — anchor on visibility first, or a cold
  // server loses the race and reads an empty gap.
  await expect(gapRows.first()).toBeVisible();
  const before = await gapRows.count();
  expect(before).toBeGreaterThan(0);
  await page.locator('.gap .own-inline').first().click();
  await expect(gapRows).toHaveCount(before - 1);
  // …and the inventory panel now lists it.
  await expect(page.locator('.panel:not(.gap) .rows li').first()).toBeVisible();
});

test('a geometry part offers both roads: agent research and datasheet upload', async ({ page }) => {
  await page.goto(`/library?p=${GOLDEN}`);
  await page.getByLabel('search parts').fill('buzzer');
  // The corpus toggle surfaces geometry parts (first call builds the index).
  await page.getByText(/whole corpus/).click();
  const geometryCard = page.locator('.card', { hasText: 'Buzzer' }).first();
  await expect(geometryCard).toBeVisible({ timeout: 25_000 });
  await geometryCard.click();
  await expect(page.getByRole('button', { name: /ask the agent to research it/i }))
    .toBeVisible();
  await expect(page.getByText(/upload its datasheet/i)).toBeVisible();
  await expect(page.getByText(/a human promotes to verified/)).toBeVisible();
});
