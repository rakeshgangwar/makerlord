import type { Block, BlockLink } from '@makerlord/project';

/**
 * Block diagram SVG from the architecture facet (stage ④). Deterministic:
 * blocks flow left-to-right in declaration order on a fixed grid.
 */
const BLOCK_W = 140;
const BLOCK_H = 70;
const GAP_X = 60;
const GAP_Y = 40;
const PER_ROW = 3;

export function renderBlockDiagram(
  blocks: Block[],
  links: BlockLink[],
  selectedId?: string,
): string {
  const pos = new Map<string, { x: number; y: number }>();
  blocks.forEach((b, i) => {
    pos.set(b.id, {
      x: 20 + (i % PER_ROW) * (BLOCK_W + GAP_X),
      y: 20 + Math.floor(i / PER_ROW) * (BLOCK_H + GAP_Y),
    });
  });

  const rows = Math.max(1, Math.ceil(blocks.length / PER_ROW));
  const width = 20 * 2 + PER_ROW * BLOCK_W + (PER_ROW - 1) * GAP_X;
  const height = 20 * 2 + rows * BLOCK_H + (rows - 1) * GAP_Y;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-renderer="blocks">`,
  ];

  for (const link of links) {
    const a = pos.get(link.from.blockId);
    const b = pos.get(link.to.blockId);
    if (!a || !b) continue;
    lines.push(
      `<line x1="${a.x + BLOCK_W}" y1="${a.y + BLOCK_H / 2}" ` +
        `x2="${b.x}" y2="${b.y + BLOCK_H / 2}" stroke="#555" stroke-width="1.6" ` +
        `data-link="${link.from.blockId}.${link.from.interfaceId}→${link.to.blockId}.${link.to.interfaceId}"/>`,
    );
  }

  for (const block of blocks) {
    const p = pos.get(block.id)!;
    const selected = block.id === selectedId;
    const sourcing =
      block.sourcing.type === 'buy' ? `buy: ${block.sourcing.partId}`
      : block.sourcing.type === 'build' ? `build (${block.sourcing.partIds.length})`
      : 'undecided';
    lines.push(
      `<g data-block="${block.id}"${selected ? ' data-selected="true"' : ''}>` +
        `<rect x="${p.x}" y="${p.y}" width="${BLOCK_W}" height="${BLOCK_H}" rx="6" ` +
        `fill="#fff" stroke="${selected ? '#1d4ed8' : '#333'}" stroke-width="${selected ? 2.4 : 1.4}"/>` +
        `<text x="${p.x + BLOCK_W / 2}" y="${p.y + 26}" font-size="13" text-anchor="middle">${block.name}</text>` +
        `<text x="${p.x + BLOCK_W / 2}" y="${p.y + 46}" font-size="9" text-anchor="middle" fill="#666">${sourcing}</text>` +
        `</g>`,
    );
  }

  lines.push('</svg>');
  return lines.join('\n');
}
