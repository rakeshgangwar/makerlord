import type { Page } from '@playwright/test';

export const GOLDEN = 'e2e0001';
export const DANGER = 'e2e0002';

/** Open a seeded project directly — the front-door click path is covered
 *  by smoke.spec.ts; everything else goes straight to the shell. */
export async function openProject(page: Page, projectId: string): Promise<void> {
  await page.addInitScript((id) => {
    localStorage.setItem('makerlord.projectId', id);
  }, projectId);
  await page.goto('/');
}

export async function pickStage(page: Page, n: number, name: string): Promise<void> {
  await page.getByRole('button', { name: `${String(n).padStart(2, '0')} ${name}` }).click();
}
