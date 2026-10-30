import { scanSiblingNeighbors, type SiblingNeighbors } from "@/domain/nodes/nodeSiblingNeighbors";
import type { Node } from "@/types/node";

// 兄弟の順序変更で、上下の1段の移動先（見えている隣の兄弟）を決める。配列は変えない

export type SiblingReorderDirection = "up" | "down";

// anchorId は T と同じ親を持つ「見えている」兄弟。
// "before": T を anchor の直前へ移す（anchor は T より前）。"after": T を anchor の直後へ移す（anchor は T より後ろ）
export type SiblingReorderTarget = {
  position: "before" | "after";
  anchorId: number;
};

export type SiblingReorderTargetResult =
  | { ok: true; target: SiblingReorderTarget }
  | { ok: false; reason: "node-missing" | "node-hidden" }
  | { ok: false; reason: "at-edge"; hiddenBeyond: boolean; isRoot: boolean };

export type SiblingReorderAvailability = { up: boolean; down: boolean };

function toTargetResult(
  neighbors: SiblingNeighbors,
  direction: SiblingReorderDirection,
): SiblingReorderTargetResult {
  const isRoot = neighbors.node.parentId === null;
  switch (direction) {
    case "up":
      return neighbors.previousVisibleId === null
        ? { ok: false, reason: "at-edge", hiddenBeyond: neighbors.hiddenBefore, isRoot }
        : {
          ok: true,
          target: { position: "before", anchorId: neighbors.previousVisibleId },
        };
    case "down":
      return neighbors.nextVisibleId === null
        ? { ok: false, reason: "at-edge", hiddenBeyond: neighbors.hiddenAfter, isRoot }
        : {
          ok: true,
          target: { position: "after", anchorId: neighbors.nextVisibleId },
        };
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}

export function findSiblingReorderTarget(
  nodes: readonly Node[],
  nodeId: number,
  direction: SiblingReorderDirection,
  visibleNodeIds: ReadonlySet<number>,
): SiblingReorderTargetResult {
  const scan = scanSiblingNeighbors(nodes, nodeId, visibleNodeIds);
  switch (scan.kind) {
    case "node-missing":
    case "node-hidden":
      return { ok: false, reason: scan.kind };
    case "found":
      return toTargetResult(scan.neighbors, direction);
    default: {
      const unreachable: never = scan;
      return unreachable;
    }
  }
}

export function getSiblingReorderAvailability(
  nodes: readonly Node[],
  nodeId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): SiblingReorderAvailability {
  if (nodeId === null) return { up: false, down: false };
  const scan = scanSiblingNeighbors(nodes, nodeId, visibleNodeIds);
  switch (scan.kind) {
    case "node-missing":
    case "node-hidden":
      return { up: false, down: false };
    case "found":
      return {
        up: toTargetResult(scan.neighbors, "up").ok,
        down: toTargetResult(scan.neighbors, "down").ok,
      };
    default: {
      const unreachable: never = scan;
      return unreachable;
    }
  }
}
