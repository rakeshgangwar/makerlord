#!/usr/bin/env node
/**
 * Build the Claude Design bridge bundle: the app's ACTUAL Svelte 5
 * components, compiled and wrapped in thin React components that mount()
 * them — shipping what we built, never a reimplementation. Output goes to
 * ds-bundle/ alongside the identity files.
 */
import { build } from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import { copyFileSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'ds-bundle');
const uiLib = resolve(root, 'packages/ui/src/lib');

// SvelteKit's $app/environment isn't available outside the app — stub it.
const stubDir = resolve(root, 'ds-bundle/.stubs');
mkdirSync(stubDir, { recursive: true });
writeFileSync(resolve(stubDir, 'environment.js'), 'export const browser = true;\n');

const COMPONENTS = [
  'StageRail', 'FindingStrip', 'BenchView', 'ChatDock', 'ArtifactsPanel',
  'Conversation', 'ConverseStart', 'MessageList', 'ToolTrail', 'Composer',
];

const entry = [
  "import { mount, unmount } from 'svelte';",
  ...COMPONENTS.map((n) => `import ${n} from '${uiLib}/components/${n}.svelte';`),
  `import SvgViewer from '${uiLib}/SvgViewer.svelte';`,
  `
const React = window.React;
function wrap(Component, name) {
  return function Wrapped(props) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const instance = mount(Component, { target: ref.current, props });
      return () => unmount(instance);
      // Re-mount on prop changes: cheap and correct for design previews.
    }, [JSON.stringify(props ?? {})]);
    return React.createElement('div', { ref, 'data-ml': name, style: { display: 'contents' } });
  };
}
window.MakerLord = {
${[...COMPONENTS, 'SvgViewer'].map((n) => `  ${n}: wrap(${n}, '${n}'),`).join('\n')}
};
`,
].join('\n');

const entryFile = resolve(stubDir, 'bridge-entry.js');
writeFileSync(entryFile, entry);

function sha12(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}
function bannerJson() {
  const sourceHashes = {};
  for (const n of COMPONENTS) {
    const path = `packages/ui/src/lib/components/${n}.svelte`;
    sourceHashes[path] = sha12(readFileSync(resolve(root, path), 'utf8'));
  }
  sourceHashes['packages/ui/src/lib/SvgViewer.svelte'] =
    sha12(readFileSync(resolve(uiLib, 'SvgViewer.svelte'), 'utf8'));
  sourceHashes['packages/ui/src/lib/app.svelte.js'] =
    sha12(readFileSync(resolve(uiLib, 'app.svelte.js'), 'utf8'));
  const header = {
    namespace: 'MakerLord',
    version: 2,
    components: [...COMPONENTS, 'SvgViewer'],
    inlinedExternals: ['svelte'],
    sourceHashes,
    note: 'compiled Svelte 5 components in React wrappers',
  };
  return `/* @ds-bundle: ${JSON.stringify(header)} */`;
}

await build({
  entryPoints: [entryFile],
  bundle: true,
  format: 'iife',
  outfile: resolve(out, '_ds_bundle.js'),
  banner: { js: bannerJson() },
  plugins: [sveltePlugin({ compilerOptions: { css: 'external' } })],
  alias: {
    '$app/environment': resolve(stubDir, 'environment.js'),
    '$lib': uiLib,
  },
  loader: { '.css': 'css' },
  nodePaths: [resolve(root, 'packages/ui/node_modules')],
  minify: false,
  logLevel: 'info',
});

// esbuild emits the collected Svelte CSS next to the JS as _ds_bundle.css.
const emittedCss = resolve(out, '_ds_bundle.css');
if (!existsSync(emittedCss)) {
  console.error('expected _ds_bundle.css to be emitted');
  process.exit(1);
}

// Vendor React UMD (18.x — the last UMD-shipping line) for preview cards.
mkdirSync(resolve(out, '_vendor'), { recursive: true });
copyFileSync(
  resolve(root, 'node_modules/react/umd/react.production.min.js'),
  resolve(out, '_vendor/react.production.min.js'),
);
copyFileSync(
  resolve(root, 'node_modules/react-dom/umd/react-dom.production.min.js'),
  resolve(out, '_vendor/react-dom.production.min.js'),
);

console.log('bridge bundle built:', COMPONENTS.length + 1, 'components');
