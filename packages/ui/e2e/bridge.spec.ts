import { expect, test } from '@playwright/test';
import { GOLDEN, openProject } from './helpers.js';

/**
 * §14 bridge-absent states: nothing renders as connected, and the control
 * that needs the bridge explains how to get one instead of failing mute.
 * No bridge runs on the e2e ports — the failure is real.
 */
test('local brain explains itself when no bridge is running', async ({ page }) => {
  // Hermetic: a developer's real mlb may own 8790 — probe a dead port.
  // Init-script so the store reads it at page boot, before any connect.
  await page.addInitScript(() => localStorage.setItem('makerlord.bridgePort', '8759'));
  await openProject(page, GOLDEN);
  const toggle = page.getByRole('button', { name: /local brain/ });
  await expect(toggle).not.toContainText('✓');

  await toggle.click();
  await expect(page.locator('.bridge-err')).toBeVisible();
  await expect(page.locator('.bridge-err')).toContainText('maker-bridge');
  // The full recovery path, on screen: install, agents, pairing.
  const help = page.locator('.bridge-help');
  await expect(help).toContainText('install.sh');
  await expect(help).toContainText('pairing code');
  // The maker can retarget the port right here.
  await expect(page.locator('.bridge-port input')).toBeVisible();
  // Still not connected.
  await expect(toggle).not.toContainText('✓');
});
