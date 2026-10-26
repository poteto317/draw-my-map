import type { Node } from "@/types/node";

// T の前後で、T に最も近い見えている兄弟と、その向きに隠れた兄弟があるか
export type SiblingNeighbors = {
  node: Node;
  previousVisibleId: number | null;
  hiddenBefore: boolean;
  nextVisibleId: number | null;
  hiddenAfter: boolean;
};

export type SiblingNeighborsScan =
  | { kind: "found"; neighbors: SiblingNeighbors }
  | { kind: "node-missing" }
  | { kind: "node-hidden" };

type SiblingsBefore = { lastVisibleId: number | null; hasHidden: boolean };

// nodes を1回だけ走査する。T に出会う前は親が分からないので、親ごとに控える
export function scanSiblingNeighbors(
  nodes: readonly Node[],
  nodeId: number,
  visibleNodeIds: ReadonlySet<number>,
): SiblingNeighborsScan {
  const beforeByParent = new Map<number | null, SiblingsBefore>();
  let neighbors: SiblingNeighbors | null = null;
  for (const node of nodes) {
    if (neighbors === null) {
      if (node.id === nodeId) {
        if (!visibleNodeIds.has(node.id)) return { kind: "node-hidden" };
        const before = beforeByParent.get(node.parentId);
        neighbors = {
          node,
          previousVisibleId: before?.lastVisibleId ?? null,
          hiddenBefore: before?.hasHidden ?? false,
          nextVisibleId: null,
          hiddenAfter: false,
        };
        continue;
      }
      const before = beforeByParent.get(node.parentId);
      const isVisible = visibleNodeIds.has(node.id);
      if (before === undefined) {
        beforeByParent.set(node.parentId, {
          lastVisibleId: isVisible ? node.id : null,
          hasHidden: !isVisible,
        });
      } else if (isVisible) {
        before.lastVisibleId = node.id;
      } else {
        before.hasHidden = true;
      }
      continue;
    }
    if (node.parentId !== neighbors.node.parentId) continue;
    if (visibleNodeIds.has(node.id)) {
      neighbors.nextVisibleId = node.id;
      break;
    }
    neighbors.hiddenAfter = true;
  }
  if (neighbors === null) return { kind: "node-missing" };
  return { kind: "found", neighbors };
}
