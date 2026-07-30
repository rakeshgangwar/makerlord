import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DANGER, GOLDEN, openProject, pickStage } from './helpers.js';

/**
 * UI spec §14 — the finding-surface safety sweep. The danger project
 * carries a LIVE engine BLOCKER (LED with no series resistor) and a
 * transcript in which the agent CLAIMS it is fixed. These tests are the
 * DOM-level analogue of the danger corpus: the presentation layer must
 * not be able to lose, soften or dismiss what the engine found.
 */

const BLOCKER_CARD = '.finding';
const FORBIDDEN =
  /\b(dismiss|hide|ignore|suppress|override|snooze|mute|silence|acknowledge)\b/i;

async function interactiveNames(page: Page): Promise<string[]> {
  return page.$$eval(
    'button, a, [role="button"], input[type="button"], input[type="submit"], summary, [role="tab"]',
    (els) =>
      els.map(
        (e) =>
          `${e.getAttribute('aria-label') ?? ''} ${e.textContent ?? ''} ${e.getAttribute('title') ?? ''}`,
      ),
  );
}

test('a BLOCKER is visible at every breakpoint', async ({ page }) => {
  await openProject(page, DANGER);
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    const card = page.locator(BLOCKER_CARD).first();
    await expect(card, `viewport ${w}×${h}`).toBeVisible();
    await expect(card, `viewport ${w}×${h}`).toContainText('BLOCKER');
    await expect(page.getByLabel('Findings'), `viewport ${w}×${h}`)
      .toContainText('blocking');
  }
});

test('no control anywhere dismisses, hides or downranks a finding', async ({ page }) => {
  // Both projects, every built stage lens — the invariant is app-wide.
  for (const id of [DANGER, GOLDEN]) {
    await openProject(page, id);
    const stages: [number, string][] = [
      [1, 'Idea'], [2, 'Feasibility'], [3, 'Requirements'],
      [4, 'Architecture'], [5, 'Simulate'], [6, 'Prototype ★'],
      [7, 'Firmware'], [8, 'Debug'],
    ];
    for (const [n, name] of stages) {
      await pickStage(page, n, name);
      for (const label of await interactiveNames(page)) {
        expect(label, `stage ${n} (${id}): "${label.trim()}"`).not.toMatch(FORBIDDEN);
      }
    }
  }
});

test('a finding card names the rule that fired — provenance, not vibes', async ({ page }) => {
  await openProject(page, DANGER);
  const card = page.locator(BLOCKER_CARD).first();
  await expect(card.locator('.rule')).toHaveText(/^RULE_[A-Z_]+$/);
  // Severity is never colour alone (§13): icon + label travel with it.
  await expect(card.locator('.sev')).toContainText('⛔');
});

test('agent prose claiming the fix does not remove the card', async ({ page }) => {
  await openProject(page, DANGER);
  // The transcript's last turn says the blocker is "resolved" — a lie.
  // The agent column shows the thread without any expand step now.
  await expect(page.getByText(/the resistor issue is resolved/)).toBeVisible();
  // The card stands: findings only ever come from engine data.
  await expect(page.locator(BLOCKER_CARD).first()).toBeVisible();
  await expect(page.getByLabel('Findings')).toContainText('blocking');
});

test('the engine refuses the advance in the browser, not just the API', async ({ page }) => {
  await openProject(page, DANGER);
  await pickStage(page, 6, 'Prototype ★');
  const done = page.getByRole('button', { name: /Done — next step/ }).first();
  await expect(done).toBeVisible();
  await done.click();
  // No success state: the step does not advance, and the refusal's own
  // findings land on the strip.
  await expect(page.locator(BLOCKER_CARD).first()).toBeVisible();
  await expect(done).toBeVisible();
});

test('tool calls survive a refresh — the transcript replays them inline', async ({ page }) => {
  // 2026-07-31 report: refreshing dropped the tool cards. The timeline
  // now rebuilds from the transcript, so the refusal card must be there
  // before AND after a reload.
  await openProject(page, DANGER);
  await expect(page.locator('.tool-card').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.tool-card').first()).toBeVisible();
});
