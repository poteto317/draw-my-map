import {
  buildReorderedSiblings,
  findReorderEndpoints,
  type ReorderedSiblings,
} from "@/domain/nodes/nodeSiblingReorderSequence";
import {
  findSiblingReorderTarget,
  type SiblingReorderDirection,
  type SiblingReorderTarget,
} from "@/domain/nodes/nodeSiblingReorderTarget";
import { swapSiblingBranchPositions } from "@/domain/nodes/nodeSiblingSwapPlacement";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

// 兄弟の順序変更の入口。移動先の解決は nodeSiblingReorderTarget、配列の組み替えは
// nodeSiblingReorderSequence が担い、ここは検証と配置モードごとの座標の適用と結果の組み立てを行う。
// 既存の import 先を保つため、移動先の解決の型と関数も再エクスポートする
export {
  findSiblingReorderTarget,
  getSiblingReorderAvailability,
  type SiblingReorderAvailability,
  type SiblingReorderDirection,
  type SiblingReorderTarget,
  type SiblingReorderTargetResult,
} from "@/domain/nodes/nodeSiblingReorderTarget";

export type SiblingReorderRequest =
  | { kind: "step"; direction: SiblingReorderDirection }
  | { kind: "drop"; target: SiblingReorderTarget };

export type SiblingReorderFailureReason =
  | "node-missing"
  | "node-hidden"
  | "invalid-target"
  | "placement-failed";

export type SiblingReorderResult =
  | {
    ok: true;
    nodes: Node[];
    direction: SiblingReorderDirection;
    visibleIndex: number;
    visibleCount: number;
    isRoot: boolean;
  }
  | { ok: false; reason: SiblingReorderFailureReason };

// useNodes.reorderSibling の戻り値（hooks と messages の両方がここから import する）
export type ReorderSiblingResult =
  | {
    ok: true;
    direction: SiblingReorderDirection;
    visibleIndex: number;
    visibleCount: number;
    isRoot: boolean;
  }
  | {
    ok: false;
    reason: "at-edge";
    direction: SiblingReorderDirection;
    hiddenBeyond: boolean;
    isRoot: boolean;
  }
  | { ok: false; reason: SiblingReorderFailureReason };

// reorderSiblingByRequest の結果。成功は reorderSiblingNodes と同じ、失敗は ReorderSiblingResult の失敗と同じ
export type SiblingReorderRequestResult =
  | Extract<SiblingReorderResult, { ok: true }>
  | Exclude<ReorderSiblingResult, { ok: true }>;

function applyManualPlacement(
  reordered: ReorderedSiblings,
): { ok: true; nodes: Node[] } | { ok: false; reason: SiblingReorderFailureReason } {
  const swapped = swapSiblingBranchPositions(
    reordered.nodes,
    reordered.first,
    reordered.second,
  );
  if (swapped.ok) return { ok: true, nodes: swapped.nodes };
  switch (swapped.reason) {
    case "overlapping-branches":
      return { ok: false, reason: "invalid-target" };
    case "placement-failed":
      return { ok: false, reason: "placement-failed" };
    default: {
      const unreachable: never = swapped.reason;
      return unreachable;
    }
  }
}

// 先頭のルートが変わったときだけ、新しい先頭のルートに旧先頭のルートの座標を引き継ぐ
function applyAutoFirstRoot(
  reordered: ReorderedSiblings,
  previousFirstRoot: Node | null,
): Node[] {
  const nextFirstRoot = reordered.firstRoot;
  if (
    previousFirstRoot === null
    || nextFirstRoot === null
    || nextFirstRoot === previousFirstRoot
  ) {
    return reordered.nodes;
  }
  return reordered.nodes.map((node) =>
    node === nextFirstRoot
      ? { ...node, x: previousFirstRoot.x, y: previousFirstRoot.y }
      : node);
}

export function reorderSiblingNodes(
  nodes: readonly Node[],
  nodeId: number,
  target: SiblingReorderTarget,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): SiblingReorderResult {
  const endpoints = findReorderEndpoints(nodes, nodeId, target.anchorId);
  if (endpoints === null) return { ok: false, reason: "node-missing" };
  const { node, anchor, anchorFirst } = endpoints;
  if (!visibleNodeIds.has(node.id)) return { ok: false, reason: "node-hidden" };
  if (
    anchor === null
    || anchor.id === node.id
    || anchor.parentId !== node.parentId
    || !visibleNodeIds.has(anchor.id)
  ) {
    return { ok: false, reason: "invalid-target" };
  }
  const isBefore = target.position === "before";
  if (isBefore !== anchorFirst) return { ok: false, reason: "invalid-target" };

  const reordered = buildReorderedSiblings(
    nodes,
    node,
    anchor,
    target.position,
    visibleNodeIds,
  );

  let placedNodes: Node[];
  switch (mode) {
    case "manual": {
      const placement = applyManualPlacement(reordered);
      if (!placement.ok) return placement;
      placedNodes = placement.nodes;
      break;
    }
    case "auto":
      placedNodes = applyAutoFirstRoot(reordered, endpoints.firstRoot);
      break;
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }

  return {
    ok: true,
    nodes: placedNodes,
    direction: isBefore ? "up" : "down",
    visibleIndex: reordered.visibleIndex,
    visibleCount: reordered.visibleCount,
    isRoot: node.parentId === null,
  };
}

// step は見えている隣の兄弟へ解決してから、drop は受け取った挿入先のまま reorderSiblingNodes を実行する
export function reorderSiblingByRequest(
  nodes: readonly Node[],
  nodeId: number,
  request: SiblingReorderRequest,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): SiblingReorderRequestResult {
  switch (request.kind) {
    case "drop":
      return reorderSiblingNodes(nodes, nodeId, request.target, visibleNodeIds, mode);
    case "step": {
      const found = findSiblingReorderTarget(nodes, nodeId, request.direction, visibleNodeIds);
      if (found.ok) return reorderSiblingNodes(nodes, nodeId, found.target, visibleNodeIds, mode);
      switch (found.reason) {
        case "at-edge":
          return {
            ok: false,
            reason: "at-edge",
            direction: request.direction,
            hiddenBeyond: found.hiddenBeyond,
            isRoot: found.isRoot,
          };
        case "node-missing":
        case "node-hidden":
          return { ok: false, reason: found.reason };
        default: {
          const unreachable: never = found;
          return unreachable;
        }
      }
    }
    default: {
      const unreachable: never = request;
      return unreachable;
    }
  }
}
