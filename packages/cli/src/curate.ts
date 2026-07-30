import {
  existsSync, readFileSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { stringify as toYaml } from 'yaml';
import { join } from 'node:path';
import {
  loadProposals, parseProposal, profilesDir, proposalsDir,
} from '@makerlord/parts';

/**
 * `maker curate` — the HUMAN half of the pipeline (D51). These commands
 * exist ONLY here: not in the registry, not in MCP, therefore not
 * callable by any agent, local brain included. Promotion is a person
 * reading citations and moving a file — the absence of any other path
 * is the guarantee, exactly like dismiss_finding.
 */

function curatedManifestPath(): string {
  return process.env.MAKERLORD_CURATED_PATH ?? './data/curated.json';
}

export function curateList(): string {
  const proposals = loadProposals();
  if (proposals.size === 0) return 'the proposals queue is empty';
  return [...proposals.values()]
    .map((p) => {
      const fields = Object.keys(p.citations).length;
      return `  ${p.partId}  (${fields} cited field${fields === 1 ? '' : 's'}, proposed ${p.proposedAt.slice(0, 10)})`;
    })
    .join('\n');
}

export function curateShow(partId: string): string {
  const p = loadProposals().get(partId);
  if (!p) throw new Error(`no proposal for "${partId}" — maker curate list`);
  const lines = [
    `${p.partId}  ←  ${p.file}`,
    `proposed ${p.proposedAt}`,
    '',
    'profile:',
    ...Object.entries(p.profile)
      .filter(([k]) => k !== 'partId' && k !== 'footprint')
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`),
    '',
    'citations (READ THESE — promotion asserts they say what the profile says):',
    ...Object.entries(p.citations).map(([field, url]) => `  ${field}: ${url}`),
  ];
  return lines.join('\n');
}

/**
 * Promotion: profile file into data/profiles/ (citations folded into a
 * provenance comment), an entry in the curated manifest, the proposal
 * removed. Verified-tier IS this location pair — nothing else confers it.
 */
export function curatePromote(partId: string): string {
  const queueDir = proposalsDir();
  const proposalPath = join(queueDir, `${partId.replace(/[^A-Za-z0-9._-]+/g, '_')}.yaml`);
  if (!existsSync(proposalPath)) {
    throw new Error(`no proposal file for "${partId}" at ${proposalPath}`);
  }
  const proposal = parseProposal(readFileSync(proposalPath, 'utf8'));

  const manifestPath = curatedManifestPath();
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    file: string; partId: string;
  }[];
  if (manifest.some((e) => e.partId === partId)) {
    throw new Error(`${partId} is already in the curated manifest`);
  }

  const header = [
    `# Promoted from the proposals queue ${new Date().toISOString().slice(0, 10)}`,
    `# (proposed ${proposal.proposedAt}). Citations reviewed at promotion:`,
    ...Object.entries(proposal.citations).map(([f, url]) => `#   ${f}: ${url}`),
  ].join('\n');
  const target = join(profilesDir(), `${partId.replace(/[^A-Za-z0-9._-]+/g, '_')}.yaml`);
  writeFileSync(target, `${header}\n${toYaml(proposal.profile)}`);
  manifest.push({ file: proposal.file, partId });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  unlinkSync(proposalPath);

  return [
    `promoted ${partId} → verified`,
    `  profile: ${target}`,
    `  manifest: ${manifestPath} (+1 entry)`,
    '  review the diff and commit — the CI curation gate is the floor',
  ].join('\n');
}

export function curateMain(argv: string[]): number {
  const [cmd, partId] = argv;
  try {
    if (cmd === 'list' || cmd === undefined) {
      process.stdout.write(`${curateList()}\n`);
    } else if (cmd === 'show' && partId) {
      process.stdout.write(`${curateShow(partId)}\n`);
    } else if (cmd === 'promote' && partId) {
      process.stdout.write(`${curatePromote(partId)}\n`);
    } else {
      process.stdout.write('usage: maker curate [list | show <partId> | promote <partId>]\n');
      return 1;
    }
    return 0;
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
