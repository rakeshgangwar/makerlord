#!/usr/bin/env node
import {
  ALL_TOOLS, findProjectFile, loadSession, runTool,
} from '@makerlord/tools';
import type { ToolCtx } from '@makerlord/tools';

interface Parsed {
  toolName: string;
  input: Record<string, unknown>;
  project?: string;
  expectHash?: string;
}

/**
 * `maker req propose --metric x --value 6` → runTool('req_propose', {...}).
 * The registry name is canonical; the CLI joins subcommand words with '_'
 * and takes the longest match.
 */
export function parseArgv(argv: string[]): Parsed {
  const words: string[] = [];
  const input: Record<string, unknown> = {};
  let project: string | undefined;
  let expectHash: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`flag --${key} needs a value`);
      }
      i += 1;
      if (key === 'project') project = value;
      else if (key === 'expect-hash') expectHash = value;
      else {
        const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        try {
          input[camel] = JSON.parse(value);
        } catch {
          input[camel] = value;
        }
      }
    } else {
      words.push(arg);
    }
  }

  const names = new Set(ALL_TOOLS.map((t) => t.name));
  for (let take = words.length; take >= 1; take -= 1) {
    const candidate = words.slice(0, take).join('_');
    if (names.has(candidate)) {
      const out: Parsed = { toolName: candidate, input };
      if (project !== undefined) out.project = project;
      if (expectHash !== undefined) out.expectHash = expectHash;
      return out;
    }
  }
  throw new Error(
    `unknown command "${words.join(' ')}" — run \`maker help\` for the catalogue`,
  );
}

function help(): string {
  const lines = ['maker — the MakerLord engine CLI', ''];
  for (const t of ALL_TOOLS) {
    lines.push(`  ${t.name.replace(/_/g, ' ')}`);
    lines.push(`      ${t.summary}`);
  }
  return lines.join('\n');
}

export async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    process.stdout.write(`${help()}\n`);
    return 0;
  }

  // The HUMAN half of the curation pipeline (D51) — deliberately outside
  // the registry, so no agent surface can reach it.
  if (argv[0] === 'curate') {
    const { curateMain } = await import('./curate.js');
    return curateMain(argv.slice(1));
  }

  try {
    const parsed = parseArgv(argv);
    const ctx: ToolCtx = { cwd: process.cwd() };

    if (parsed.toolName !== 'project_init') {
      const path =
        parsed.project ??
        process.env.MAKERLORD_PROJECT ??
        findProjectFile(process.cwd());
      ctx.session = loadSession(path);
    }

    const result = await runTool(
      parsed.toolName,
      parsed.input,
      ctx,
      parsed.expectHash,
    );
    // Success AND refusal both exit 0 — a refusal is the tool doing its job.
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');

if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
