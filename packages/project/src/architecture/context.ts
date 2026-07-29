import type { ProjectContext } from '../requirements/rules.js';
import type { Block, BlockInterface, BlockLink } from './types.js';

export function findBlock(
  ctx: ProjectContext,
  blockId: string,
): Block | undefined {
  return ctx.project.architecture.blocks.find((b) => b.id === blockId);
}

export function findInterface(
  block: Block,
  interfaceId: string,
): BlockInterface | undefined {
  return block.interfaces.find((i) => i.id === interfaceId);
}

export function linksTouching(
  ctx: ProjectContext,
  blockId: string,
  interfaceId: string,
): BlockLink[] {
  return ctx.project.architecture.links.filter(
    (l) =>
      (l.from.blockId === blockId && l.from.interfaceId === interfaceId) ||
      (l.to.blockId === blockId && l.to.interfaceId === interfaceId),
  );
}
