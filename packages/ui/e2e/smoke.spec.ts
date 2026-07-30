import { expect, test } from '@playwright/test';

/**
 * The harness proof: both webServers up, both seeded projects visible
 * through the real front door, and opening one renders the shell.
 */
test('front door lists the seeded projects', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /what do you/i })).toBeVisible();
  await expect(page.getByText('a desk lamp indicator')).toBeVisible();
  await expect(page.getByText('an LED wired straight to 5V')).toBeVisible();
});

test('opening the golden project renders the stage rail', async ({ page }) => {
  await page.goto('/');
  await page.getByText('a desk lamp indicator').click();
  await expect(page.getByRole('navigation', { name: 'Stages' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Prototype/ })).toBeVisible();
  // The finding meter is part of the frame on every screen.
  await expect(page.getByLabel('Findings')).toBeVisible();
});
