import { expect, test } from '@playwright/test';
import { GOLDEN, openProject, pickStage } from './helpers.js';

/**
 * The ⑦ lens (firmware spec §8): behaviors, the pin plan with its
 * read-only pins, and the flash panel that NEVER renders a control the
 * engine would refuse (D47) — the seeded project has a shut gate and no
 * compiled bin, so the locked reason is exactly what must show.
 */
test.beforeEach(async ({ page }) => {
  await openProject(page, GOLDEN);
  await pickStage(page, 7, 'Firmware');
});

test('the lens shows the seeded behavior and the derived pin plan', async ({ page }) => {
  await expect(page.getByText('⑦ Firmware', { exact: false })).toBeVisible();
  await expect(page.locator('.beh-id')).toHaveText('blink-on');
  const row = page.locator('.plan-table tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.role')).toHaveText('INDICATOR');
  // The pin column is visibly locked — derived, never edited (D46).
  await expect(row.locator('.pin-locked')).toContainText('D5 PWM');
  await expect(row.locator('input')).toHaveCount(0);
});

test('the flash panel renders the locked reason, not a flash control (D47)', async ({ page }) => {
  const panel = page.locator('.flash');
  await expect(panel).toHaveAttribute('data-flash-state', 'locked');
  await expect(panel.getByText(/power gate/)).toBeVisible();
  await expect(panel.getByRole('button', { name: /flash the board/i })).toHaveCount(0);
});

test('generated firmware files appear in the file tree', async ({ page }) => {
  await page.locator('nav summary', { hasText: 'Firmware' }).click();
  await expect(page.getByText('pins.h')).toBeVisible();
  await expect(page.getByText('main.cpp')).toBeVisible();
});

test('the serial monitor frames device output as unverified', async ({ page }) => {
  await expect(page.getByText('[device output — unverified]')).toBeVisible();
});
