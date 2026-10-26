import { scanSiblingNeighbors, type SiblingNeighbors } from "@/domain/nodes/nodeSiblingNeighbors";
import { swapSiblingBranchPositions } from "@/domain/nodes/nodeSiblingSwapPlacement";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type SiblingReorderDirection = "up" | "down";

// anchorId は T と同じ親を持つ「見えている」兄弟。
// "before": T を anchor の直前へ移す（anchor は T より前）。"after": T を anchor の直後へ移す（anchor は T より後ろ）
export type SiblingReorderTarget = {
  position: "before" | "after";
  anchorId: number;
};

export type SiblingReorderRequest =
  | { kind: "step"; direction: SiblingReorderDirection }
  | { kind: "drop"; target: SiblingReorderTarget };

export type SiblingReorderTargetResult =
  | { ok: true; target: SiblingReorderTarget }
  | { ok: false; reason: "node-missing" | "node-hidden" }
  | { ok: false; reason: "at-edge"; hiddenBeyond: boolean; isRoot: boolean };

export type SiblingReorderAvailability = { up: boolean; down: boolean };

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

type ReorderEndpoints = {
  node: Node;
  anchor: Node | null;
  anchorFirst: boolean;
  firstRoot: Node | null;
};

// T・anchor・最初のルートを1回の走査で求める。T と anchor は先に出会ったものを使う
function findReorderEndpoints(
  nodes: readonly Node[],
  nodeId: number,
  anchorId: number,
): ReorderEndpoints | null {
  let node: Node | null = null;
  let anchor: Node | null = null;
  let anchorFirst = false;
  let firstRoot: Node | null = null;
  for (const candidate of nodes) {
    if (firstRoot === null && candidate.parentId === null) firstRoot = candidate;
    if (node === null && candidate.id === nodeId) node = candidate;
    else if (anchor === null && candidate.id === anchorId) {
      anchor = candidate;
      anchorFirst = node === null;
    }
  }
  if (node === null) return null;
  return { node, anchor, anchorFirst, firstRoot };
}

type ReorderedSiblings = {
  nodes: Node[];
  // 並べ替えた後の兄弟の列で上に来る組と下に来る組の、根ノードの ID
  first: number[];
  second: number[];
  visibleIndex: number;
  visibleCount: number;
  firstRoot: Node | null;
};

// nodes を1回だけ走査して新しい配列を作る。T だけを anchor の前後へ移し、ほかは同じオブジェクトのまま積む
function buildReorderedSiblings(
  nodes: readonly Node[],
  node: Node,
  anchor: Node,
  position: SiblingReorderTarget["position"],
  visibleNodeIds: ReadonlySet<number>,
): ReorderedSiblings {
  const result: Node[] = [];
  const skipped: number[] = [];
  let collecting = false;
  let visibleIndex = 0;
  let visibleCount = 0;
  let placed = false;
  let firstRoot: Node | null = null;

  const pushNode = (pushed: Node) => {
    if (firstRoot === null && pushed.parentId === null) firstRoot = pushed;
    if (pushed === node) placed = true;
    if (pushed.parentId === node.parentId && visibleNodeIds.has(pushed.id)) {
      if (!placed) visibleIndex += 1;
      visibleCount += 1;
    }
    result.push(pushed);
  };

  for (const candidate of nodes) {
    if (candidate === node) {
      // "before" は anchor から T の直前まで、"after" は T の直後から anchor までを集める
      collecting = position === "after";
      continue;
    }
    if (candidate === anchor) {
      if (position === "before") {
        collecting = true;
        skipped.push(candidate.id);
        pushNode(node);
        pushNode(candidate);
      } else {
        collecting = false;
        skipped.push(candidate.id);
        pushNode(candidate);
        pushNode(node);
      }
      continue;
    }
    if (collecting && candidate.parentId === node.parentId) {
      skipped.push(candidate.id);
    }
    pushNode(candidate);
  }

  const isBefore = position === "before";
  return {
    nodes: result,
    first: isBefore ? [node.id] : skipped,
    second: isBefore ? skipped : [node.id],
    visibleIndex,
    visibleCount,
    firstRoot,
  };
}

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
