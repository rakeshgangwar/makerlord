#!/usr/bin/env node
/**
 * Bundle maker-bridge into ONE self-contained file: dist/bridge.cjs.
 * The same file serves both roles — daemon by default, MCP server via
 * `bridge.cjs mcp` — so the daemon spawns process.execPath + itself and
 * the whole local-brain story ships as a single artifact (CI uploads it;
 * install.sh points a wrapper at it). Node is the only prerequisite.
 */
import { build } from 'esbuild';
import { chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [resolve(root, 'packages/bridge/dist/main.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(root, 'dist/bridge.cjs'),
  // No banner: esbuild hoists the entry's own #!/usr/bin/env node shebang.
  logLevel: 'info',
});
chmodSync(resolve(root, 'dist/bridge.cjs'), 0o755);
console.log('bridge bundle: dist/bridge.cjs');
