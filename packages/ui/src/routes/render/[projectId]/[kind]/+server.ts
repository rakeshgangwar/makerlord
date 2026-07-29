import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';
import type { Circuit } from '@makerlord/circuit';
import type { Footprint } from '@makerlord/parts';
import { board, defsMap, profilesMap } from '@makerlord/tools';
import { renderBlockDiagram } from '$lib/renderers/blocks.js';
import { renderBreadboard } from '$lib/renderers/breadboard.js';
import { renderSchematic } from '$lib/renderers/schematic.js';

/**
 * Deterministic SVG projections of project.json (D2), rendered server-side
 * where the part corpus lives. The browser gets an image; the model stays
 * the source of truth.
 */
const API = (): string => env.MAKERLORD_API_URL ?? 'http://127.0.0.1:8787';

interface ProjectResponse {
  file: {
    project: {
      architecture: { blocks: never[]; links: never[] };
      circuit?: Circuit;
    };
  };
}

export const GET: RequestHandler = async ({ params, url }) => {
  const headers: Record<string, string> = {};
  if (env.MAKERLORD_ACCESS_TOKEN) {
    headers.authorization = `Bearer ${env.MAKERLORD_ACCESS_TOKEN}`;
  }
  const upstream = await fetch(`${API()}/api/projects/${params.projectId}`, { headers });
  if (!upstream.ok) throw error(upstream.status, 'project not found');
  const { file } = (await upstream.json()) as ProjectResponse;
  const selected = url.searchParams.get('selected') ?? undefined;

  let svg: string;
  switch (params.kind) {
    case 'blocks':
      svg = renderBlockDiagram(
        file.project.architecture.blocks,
        file.project.architecture.links,
        selected,
      );
      break;
    case 'schematic': {
      const circuit = file.project.circuit;
      if (!circuit) throw error(404, 'no circuit yet');
      svg = renderSchematic(circuit, defsMap(), selected);
      break;
    }
    case 'breadboard': {
      const circuit = file.project.circuit;
      if (!circuit) throw error(404, 'no circuit yet');
      const footprints = new Map<string, Footprint>();
      for (const [id, profile] of profilesMap()) footprints.set(id, profile.footprint);
      svg = renderBreadboard(board(), circuit, footprints, selected);
      break;
    }
    default:
      throw error(404, `unknown renderer "${params.kind}"`);
  }

  return new Response(svg, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache' },
  });
};
