import { expect, test } from '@playwright/test';
import { GOLDEN, openProject, pickStage } from './helpers.js';

/**
 * The §7 golden project, walked through the lenses in a real browser.
 * Every assertion is against engine-projected data (D2) — the seeder ran
 * the real registry; the browser only renders what it produced.
 */
test.beforeEach(async ({ page }) => {
  await openProject(page, GOLDEN);
});

test('③ requirements table shows the confirmed requirement', async ({ page }) => {
  await pickStage(page, 3, 'Requirements');
  const row = page.locator('.req-table tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('supply_capacity');
  // req_confirm flipped provenance assumed → stated; the badge must agree.
  await expect(row.locator('.prov')).toHaveText('stated');
});

test('④ architecture renders the blocks and their sourcing', async ({ page }) => {
  await pickStage(page, 4, 'Architecture');
  await expect(page.locator('.blocks-canvas')).toBeVisible();
  const blocks = page.locator('.block-list li');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.filter({ hasText: 'controller' }))
    .toContainText('buy · arduino_Uno_Rev3(fix)');
  await expect(blocks.filter({ hasText: 'indicator LED' })).toContainText('build');
});

test('⑤ simulate inlines the schematic with a layout engine stamp', async ({ page }) => {
  await pickStage(page, 5, 'Simulate');
  // The schematic is INLINE svg (probe-able), not an <img> — and it names
  // the layout that produced it (ladder or elk), which is what makes a
  // layout regression diagnosable from a failing e2e run.
  const svg = page.locator('.svg-host svg');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('data-layout', /ladder|elk/);
});

test('the file tree lists the projected artefacts', async ({ page }) => {
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  // Design documents ship open in the tree; deeper groups are a click away.
  await expect(page.getByText('requirements.md')).toBeVisible();
  await expect(page.getByText('architecture.md')).toBeVisible();
  await page.getByText('Model', { exact: false }).click();
  await expect(page.getByText('project.json')).toBeVisible();
});
