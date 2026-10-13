import { SIBLING_VERTICAL_GAP } from "@/config/shapes";
import { hasSufficientGap } from "@/domain/nodes/nodeLayoutArithmetic";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type DuplicateSubtreeResult = { nodes: Node[]; rootId: number };

type AllocateNodeIds = (occupied: readonly Node[], count: number) => number[];

function collectSubtreeIds(nodes: readonly Node[], sourceId: number): Set<number> {
  const childIdsByParentId = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const childIds = childIdsByParentId.get(node.parentId);
    if (childIds) childIds.push(node.id);
    else childIdsByParentId.set(node.parentId, [node.id]);
  }

  const subtreeIds = new Set([sourceId]);
  const queue = [sourceId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const childId of childIdsByParentId.get(queue[index]) ?? []) {
      subtreeIds.add(childId);
      queue.push(childId);
    }
  }
  return subtreeIds;
}

// 手動配置では、マップ全体の下端からSIBLING_VERTICAL_GAPだけ空けた位置へ枝を平行移動する。
// 非有限値になる場合や、丸めで間隔を確保できない場合はnullを返す。
function calculateManualOffsetY(
  nodes: readonly Node[],
  sources: readonly Node[],
): number | null {
  let bottom = -Infinity;
  for (const node of nodes) {
    const nodeBottom = node.y + node.height;
    if (nodeBottom > bottom) bottom = nodeBottom;
  }

  let top = Infinity;
  for (const node of sources) {
    if (node.y < top) top = node.y;
  }

  const offsetY = bottom + SIBLING_VERTICAL_GAP - top;
  if (!Number.isFinite(bottom) || !Number.isFinite(offsetY)) return null;
  if (!hasSufficientGap(bottom, top + offsetY, SIBLING_VERTICAL_GAP)) return null;
  return offsetY;
}

function moveVertically(node: Node, offsetY: number): number | null {
  const y = node.y + offsetY;
  if (!Number.isFinite(y) || !Number.isFinite(y + node.height)) return null;
  return y;
}

export function duplicateNodeSubtree(
  nodes: readonly Node[],
  sourceId: number,
  mode: NodeLayoutMode,
  allocateIds: AllocateNodeIds,
): DuplicateSubtreeResult | null {
  if (!nodes.some((node) => node.id === sourceId)) return null;

  const subtreeIds = collectSubtreeIds(nodes, sourceId);
  const sources = nodes.filter((node) => subtreeIds.has(node.id));
  const ids = allocateIds(nodes, sources.length);
  const copiedIdBySourceId = new Map(
    sources.map((node, index) => [node.id, ids[index]]),
  );

  const offsetY = mode === "manual" ? calculateManualOffsetY(nodes, sources) : 0;
  if (offsetY === null) return null;

  const copies: Node[] = [];
  for (const source of sources) {
    const y = mode === "manual" ? moveVertically(source, offsetY) : source.y;
    if (y === null) return null;
    copies.push({
      ...source,
      id: copiedIdBySourceId.get(source.id)!,
      parentId: source.id === sourceId
        ? source.parentId
        : copiedIdBySourceId.get(source.parentId!)!,
      y,
    });
  }

  return {
    nodes: [...nodes, ...copies],
    rootId: copiedIdBySourceId.get(sourceId)!,
  };
}
