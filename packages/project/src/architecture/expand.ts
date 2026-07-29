import type { Circuit, IntentNet, PartInstance } from '@makerlord/circuit';
import type { Project } from '../model.js';

/**
 * Spec §5.4. Blocks are retained, not consumed: each PartInstance carries the
 * blockId it came from, which is how the hierarchical schematic (D27) knows
 * which sheet a part belongs on.
 */
export function expandArchitecture(project: Project): Circuit {
  const parts: PartInstance[] = [];
  const firstRefOf = new Map<string, string>();
  let n = 0;

  for (const block of project.architecture.blocks) {
    if (block.sourcing.type === 'undecided') {
      throw new Error(
        `expandArchitecture: block "${block.id}" is undecided — choose buy or ` +
          'build before expanding',
      );
    }
    const defIds =
      block.sourcing.type === 'buy'
        ? [block.sourcing.partId]
        : block.sourcing.partIds;

    for (const defId of defIds) {
      n += 1;
      const ref = `${block.id.toUpperCase()}${n}`;
      parts.push({ ref, defId, blockId: block.id });
      if (!firstRefOf.has(block.id)) firstRefOf.set(block.id, ref);
    }
  }

  const intent: IntentNet[] = project.architecture.links.map((link, i) => {
    const fromRef = firstRefOf.get(link.from.blockId);
    const toRef = firstRefOf.get(link.to.blockId);
    if (!fromRef) {
      throw new Error(
        `expandArchitecture: link references unknown block "${link.from.blockId}"`,
      );
    }
    if (!toRef) {
      throw new Error(
        `expandArchitecture: link references unknown block "${link.to.blockId}"`,
      );
    }
    return {
      name: `net_${i}_${link.from.interfaceId}`,
      members: [
        { ref: fromRef, pin: link.from.interfaceId },
        { ref: toRef, pin: link.to.interfaceId },
      ],
    };
  });

  return { boardId: 'half', parts, wires: [], intent };
}
