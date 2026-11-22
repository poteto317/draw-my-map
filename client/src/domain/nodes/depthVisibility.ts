import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";

/** ルート深さ 0。maxDepth null = 無制限（全 ID）。 */
export function collectDepthVisibleNodeIds(
  nodes: readonly Node[],
  maxDepth: number | null,
): ReadonlySet<number> {
  const allIds = new Set(nodes.map((node) => node.id));
  if (maxDepth === null) return allIds;

  const forest = indexNodeForest(nodes);
  if (forest === null) return allIds;

  const visible = new Set<number>();
  for (const [id, depth] of forest.depthById) {
    if (depth <= maxDepth) visible.add(id);
  }
  return visible;
}

export function measureNodeDepth(
  nodes: readonly Node[],
  nodeId: number,
): number | null {
  const forest = indexNodeForest(nodes);
  if (forest === null) return null;
  return forest.depthById.get(nodeId) ?? null;
}

/** 検索着地で制限より深いとき、引き上げ後の N。変更不要なら null。 */
export function resolveDepthLimitForReveal(
  maxDepth: number | null,
  nodeDepth: number,
): number | null {
  if (maxDepth === null || nodeDepth <= maxDepth) return null;
  return nodeDepth;
}
