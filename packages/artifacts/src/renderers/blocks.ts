// The bundled build runs in-process with no optional 'web-worker' require.
import ElkDefault from 'elkjs/lib/elk.bundled.js';
import type { ELK as ElkApi, ElkNode, ElkExtendedEdge } from 'elkjs';
import type { Block, BlockLink, BlockInterface } from '@makerlord/project';

const ELK = ElkDefault as unknown as new () => ElkApi;

/**
 * Stage ④'s block diagram, in the vernacular of a datasheet block diagram
 * (D45's engine, this facet's information): ELK layered left→right, ports
 * on block edges (consumes west, provides east), edges typed and labelled
 * from the interfaces they join — power in copper with V·mA, data in
 * solder-mask green with the bus kind — sourcing as visual language, and
 * the power budget computed onto the canvas. Deterministic for a given
 * architecture; the layout is separable for KiCad sheets later (D26/27).
 */

export interface BlockRenderOptions {
  selectedId?: string;
  /** Resolve a curated part id to its human title (buy-sourcing labels). */
  titleFor?: (partId: string) => string | undefined;
}

const PAD_X = 12;
const NAME_LINE_H = 16;
const PORT_ROW_H = 16;
const CHAR_W = 7.2;
const MIN_W = 150;
const MAX_W = 250;

function wrapName(name: string, maxChars = 26): string[] {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function sourcingLabel(b: Block, titleFor?: BlockRenderOptions['titleFor']): string {
  if (b.sourcing.type === 'buy') {
    const title = titleFor?.(b.sourcing.partId);
    const label = title ?? `part ${b.sourcing.partId.slice(0, 10)}…`;
    return `buy · ${label.length > 26 ? `${label.slice(0, 25)}…` : label}`;
  }
  if (b.sourcing.type === 'build') {
    return `build · ${b.sourcing.partIds.length} part${b.sourcing.partIds.length === 1 ? '' : 's'}`;
  }
  return 'undecided';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface NodeGeom {
  block: Block;
  lines: string[];
  width: number;
  height: number;
  west: BlockInterface[];
  east: BlockInterface[];
}

function geometry(b: Block): NodeGeom {
  const lines = wrapName(b.name);
  const west = b.interfaces.filter((i) => i.direction === 'consumes');
  const east = b.interfaces.filter((i) => i.direction === 'provides');
  const portRows = Math.max(west.length, east.length);
  const longest = Math.max(
    ...lines.map((l) => l.length),
    sourcingLabel(b).length * 0.85,
  );
  const width = Math.max(MIN_W, Math.min(MAX_W, longest * CHAR_W + PAD_X * 2 + 16));
  const height =
    10 + lines.length * NAME_LINE_H            // name
    + 18                                       // sourcing chip row
    + Math.max(portRows * PORT_ROW_H, 6)       // port rows
    + (b.power ? 14 : 6);                      // power footer
  return { block: b, lines, width, height, west, east };
}

function portY(g: NodeGeom, _list: BlockInterface[], i: number): number {
  return 10 + g.lines.length * NAME_LINE_H + 18 + i * PORT_ROW_H + PORT_ROW_H / 2;
}

export async function renderBlockDiagram(
  blocks: Block[],
  links: BlockLink[],
  opts: BlockRenderOptions | string = {},
): Promise<string> {
  // Back-compat: the third argument used to be selectedId.
  const options: BlockRenderOptions = typeof opts === 'string' ? { selectedId: opts } : opts;
  const geoms = new Map(blocks.map((b) => [b.id, geometry(b)]));

  const elk = new ELK();
  const graph: ElkNode = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.padding': '[top=18,left=18,bottom=30,right=18]',
    },
    children: blocks.map((b) => {
      const g = geoms.get(b.id)!;
      return {
        id: b.id,
        width: g.width,
        height: g.height,
        layoutOptions: { portConstraints: 'FIXED_POS' },
        ports: [
          ...g.west.map((p, i) => ({
            id: `${b.id}::${p.id}`, width: 0.1, height: 0.1,
            x: 0, y: portY(g, g.west, i),
          })),
          ...g.east.map((p, i) => ({
            id: `${b.id}::${p.id}`, width: 0.1, height: 0.1,
            x: g.width, y: portY(g, g.east, i),
          })),
        ],
      };
    }),
    edges: links.map((l, i) => ({
      id: `link${i}`,
      sources: [`${l.from.blockId}::${l.from.interfaceId}`],
      targets: [`${l.to.blockId}::${l.to.interfaceId}`],
    })),
  });

  const width = graph.width ?? 600;
  const height = (graph.height ?? 300) + 18;   // room for the budget footer
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-renderer="blocks" font-family="Archivo, system-ui, sans-serif">`,
    `<defs>
      <marker id="arr-power" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b26a38"/></marker>
      <marker id="arr-data" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#0e6b4a"/></marker>
    </defs>`,
    `<rect width="${width}" height="${height}" fill="#fff"/>`,
  ];

  // ── edges: typed and labelled from the interfaces they join ──
  ((graph.edges ?? []) as ElkExtendedEdge[]).forEach((e, idx) => {
    const link = links[idx]!;
    const fromBlock = blocks.find((b) => b.id === link.from.blockId);
    const iface = fromBlock?.interfaces.find((i) => i.id === link.from.interfaceId);
    const isPower = iface?.kind === 'power';
    const stroke = isPower ? '#b26a38' : '#0e6b4a';
    const w = isPower ? 2.6 : 1.5;
    const marker = isPower ? 'arr-power' : 'arr-data';
    for (const s of e.sections ?? []) {
      const pts: [number, number][] = [
        [s.startPoint.x, s.startPoint.y],
        ...(s.bendPoints ?? []).map((b): [number, number] => [b.x, b.y]),
        [s.endPoint.x, s.endPoint.y],
      ];
      out.push(
        `<polyline data-link="${esc(link.from.blockId)}.${esc(link.from.interfaceId)}→${esc(link.to.blockId)}.${esc(link.to.interfaceId)}" ` +
          `points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" marker-end="url(#${marker})"/>`,
      );
      // Label at the midpoint: power carries V·mA, data carries the bus kind.
      const mid = pts[Math.floor(pts.length / 2)]!;
      const label = isPower
        ? [
            iface?.voltageV !== undefined ? `${iface.voltageV}V` : '',
            iface?.currentMa !== undefined ? `${iface.currentMa}mA` : '',
          ].filter(Boolean).join(' · ') || 'power'
        : iface?.kind ?? 'signal';
      out.push(
        `<text x="${mid[0]}" y="${mid[1] - 5}" font-size="9" font-family="IBM Plex Mono, monospace" ` +
          `fill="${stroke}" text-anchor="middle">${esc(label)}</text>`,
      );
    }
  });

  // ── blocks: sourcing as visual language ──
  let totalActiveMa = 0;
  let anyPower = false;
  for (const node of graph.children ?? []) {
    const g = geoms.get(node.id)!;
    const b = g.block;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const selected = b.id === options.selectedId;
    const border =
      selected ? '#1d4ed8'
      : b.sourcing.type === 'undecided' ? '#b87400'
      : b.sourcing.type === 'build' ? '#b26a38'
      : '#333';
    const dash = b.sourcing.type === 'undecided' ? ' stroke-dasharray="6 4"' : '';
    out.push(`<g data-block="${esc(b.id)}"${selected ? ' data-selected="true"' : ''}>`);
    out.push(
      `<rect x="${x}" y="${y}" width="${g.width}" height="${g.height}" rx="8" fill="#fff" ` +
        `stroke="${border}" stroke-width="${selected ? 2.6 : 1.6}"${dash}/>`,
    );
    g.lines.forEach((line, i) => {
      out.push(
        `<text x="${x + g.width / 2}" y="${y + 20 + i * NAME_LINE_H}" font-size="12.5" font-weight="600" text-anchor="middle">${esc(line)}</text>`,
      );
    });
    const chipY = y + 10 + g.lines.length * NAME_LINE_H + 4;
    const chipFill =
      b.sourcing.type === 'buy' ? '#dcefe6'
      : b.sourcing.type === 'build' ? '#f0e4d7'
      : '#f3e8cf';
    const chipInk =
      b.sourcing.type === 'buy' ? '#0e6b4a'
      : b.sourcing.type === 'build' ? '#b26a38'
      : '#b87400';
    const chipText = sourcingLabel(b, options.titleFor);
    const chipW = Math.min(g.width - 16, chipText.length * 5.6 + 12);
    out.push(
      `<rect x="${x + (g.width - chipW) / 2}" y="${chipY - 9}" width="${chipW}" height="13" rx="6.5" fill="${chipFill}"/>` +
        `<text x="${x + g.width / 2}" y="${chipY + 1}" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="${chipInk}" text-anchor="middle">${esc(chipText)}</text>`,
    );
    // Ports: stubs + kind labels; consumes west, provides east.
    g.west.forEach((p, i) => {
      const py = y + portY(g, g.west, i);
      out.push(
        `<circle cx="${x}" cy="${py}" r="3" fill="#fff" stroke="#333" stroke-width="1.2"/>` +
          `<text x="${x + 8}" y="${py + 3}" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#4c555c">${esc(p.kind)}</text>`,
      );
    });
    g.east.forEach((p, i) => {
      const py = y + portY(g, g.east, i);
      out.push(
        `<circle cx="${x + g.width}" cy="${py}" r="3" fill="#fff" stroke="#333" stroke-width="1.2"/>` +
          `<text x="${x + g.width - 8}" y="${py + 3}" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#4c555c" text-anchor="end">${esc(p.kind)}</text>`,
      );
    });
    if (b.power) {
      anyPower = true;
      totalActiveMa += b.power.activeMa;
      out.push(
        `<text x="${x + g.width - 6}" y="${y + g.height - 6}" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#b26a38" text-anchor="end">${b.power.activeMa}mA</text>`,
      );
    }
    out.push('</g>');
  }

  // ── the budget footer: the question stage ④ exists to answer ──
  if (anyPower) {
    out.push(
      `<text x="18" y="${height - 8}" font-size="10" font-family="IBM Plex Mono, monospace" fill="#4c555c">` +
        `total active ≈ ${totalActiveMa}mA</text>`,
    );
  }

  out.push('</svg>');
  return out.join('\n');
}
