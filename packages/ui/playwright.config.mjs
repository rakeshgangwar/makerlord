import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

/**
 * The e2e stack is the REAL stack: makerlord-server (dummy API key — no
 * agent turn is ever prompted, spec §14 is deterministic) behind the
 * SvelteKit preview server's /app-api proxy. Projects are seeded through
 * the real tool registry by e2e/seed.mjs — no mocks of our own code.
 */
const repo = resolve(__dirname, '../..');
const projectsRoot = resolve(__dirname, 'e2e/.projects');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/seed.mjs',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node ../server/dist/main.js',
      url: 'http://127.0.0.1:8799/healthz',
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: '8799',
        ANTHROPIC_API_KEY: 'e2e-no-llm',
        MAKERLORD_PROJECTS_ROOT: projectsRoot,
        MAKERLORD_FRITZING_PATH: resolve(repo, 'vendor/fritzing-parts'),
        MAKERLORD_PROFILES_PATH: resolve(repo, 'data/profiles'),
        MAKERLORD_CURATED_PATH: resolve(repo, 'data/curated.json'),
        MAKERLORD_BOARD_GRID_PATH: resolve(repo, 'data/boards/half-breadboard.json'),
      },
    },
    {
      command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        MAKERLORD_API_URL: 'http://127.0.0.1:8799',
        // The /render route runs the engine in the UI server process too.
        MAKERLORD_FRITZING_PATH: resolve(repo, 'vendor/fritzing-parts'),
        MAKERLORD_PROFILES_PATH: resolve(repo, 'data/profiles'),
        MAKERLORD_CURATED_PATH: resolve(repo, 'data/curated.json'),
        MAKERLORD_BOARD_GRID_PATH: resolve(repo, 'data/boards/half-breadboard.json'),
      },
    },
  ],
});
