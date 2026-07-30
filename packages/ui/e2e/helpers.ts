import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export const GOLDEN = 'e2e0001';
export const DANGER = 'e2e0002';

const here = resolve(fileURLToPath(import.meta.url), '..');

/** The maker the seeder registered — sid is a live cookie value. */
export function testSession(): { sid: string; userId: string; handle: string } {
  return JSON.parse(readFileSync(join(here, '.auth.json'), 'utf8'));
}

/** Sign in as the seeded maker by planting the session cookie (the
 *  ceremony itself is covered by auth.spec.ts's virtual authenticator). */
export async function signIn(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: 'ml_session', value: testSession().sid, url: 'http://127.0.0.1:4173' },
    { name: 'ml_session', value: testSession().sid, url: 'http://localhost:4173' },
  ]);
}

/** Open a seeded project directly — the front-door click path is covered
 *  by smoke.spec.ts; everything else goes straight to the shell. */
export async function openProject(page: Page, projectId: string): Promise<void> {
  await signIn(page);
  await page.addInitScript((id) => {
    localStorage.setItem('makerlord.projectId', id);
  }, projectId);
  await page.goto('/');
}

export async function pickStage(page: Page, n: number, name: string): Promise<void> {
  await page.getByRole('button', { name: `${String(n).padStart(2, '0')} ${name}` }).click();
}
