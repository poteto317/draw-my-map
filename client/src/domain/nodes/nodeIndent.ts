import {
  applyBranchPlacement,
  calculateIndentTranslation,
  calculateOutdentTranslation,
} from "@/domain/nodes/nodeIndentPlacement";
import { scanSiblingNeighbors } from "@/domain/nodes/nodeSiblingNeighbors";
import { canConnectNodes, indexFirstNodes } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type NodeIndentDirection = "indent" | "outdent"; // indent = 階層を下げる、outdent = 階層を上げる

export type NodeIndentAvailability = { indent: boolean; outdent: boolean };

export type NodeIndentFailureReason =
  | "node-missing"
  | "node-hidden"
  | "invalid-structure"
  | "placement-failed";

type NodeIndentSuccess = {
  ok: true;
  direction: NodeIndentDirection;
  newParentId: number | null; // 上げてルートになったら null
  newParentLabel: string | null; // 新しい親の label（生の値。空文字もそのまま）。ルートなら null
  depth: number; // 移した後の T の深さ。ルートが 1
};

type NodeIndentAtEdge =
  | { ok: false; reason: "at-edge"; direction: "indent"; hiddenBeyond: boolean; isRoot: boolean }
  | { ok: false; reason: "at-edge"; direction: "outdent" }; // 上げられないのはルートだけ

export type NodeIndentResult =
  | (NodeIndentSuccess & { nodes: Node[] })
  | NodeIndentAtEdge
  | { ok: false; reason: NodeIndentFailureReason };

// useNodes.changeNodeIndent の戻り値（hooks と messages の両方がここから import する）
export type ChangeNodeIndentResult =
  | NodeIndentSuccess
  | NodeIndentAtEdge
  | { ok: false; reason: NodeIndentFailureReason };

export function getNodeIndentAvailability(
  nodes: readonly Node[],
  nodeId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): NodeIndentAvailability {
  if (nodeId === null) return { indent: false, outdent: false };
  const scan = scanSiblingNeighbors(nodes, nodeId, visibleNodeIds);
  switch (scan.kind) {
    case "node-missing":
    case "node-hidden":
      return { indent: false, outdent: false };
    case "found":
      return {
        indent: scan.neighbors.previousVisibleId !== null,
        outdent: scan.neighbors.node.parentId !== null,
      };
    default: {
      const unreachable: never = scan;
      return unreachable;
    }
  }
}

// T から parentId を辿った祖先の数 + 1。循環や、配列に無い祖先があれば null
function measureDepth(nodes: readonly Node[], nodeId: number): number | null {
  const nodesById = indexFirstNodes(nodes);
  const visited = new Set<number>();
  let current = nodesById.get(nodeId);
  let depth = 0;
  while (current !== undefined) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    depth += 1;
    if (current.parentId === null) return depth;
    current = nodesById.get(current.parentId);
  }
  return null;
}

// P の子のうち配列で最後のもの
function findLastChild(nodes: readonly Node[], parentId: number): Node | null {
  let lastChild: Node | null = null;
  for (const node of nodes) {
    if (node.parentId === parentId) lastChild = node;
  }
  return lastChild;
}

// T を新しい親 P の子の末尾にする。L があれば T を L の直後へ移し、無ければ T の位置のまま。
// T 以外は同じオブジェクトのまま積む
function buildIndentedNodes(nodes: readonly Node[], target: Node, parent: Node): Node[] {
  const lastChild = findLastChild(nodes, parent.id);
  const moved: Node = { ...target, parentId: parent.id };
  const result: Node[] = [];
  for (const node of nodes) {
    if (node === target) {
      if (lastChild === null) result.push(moved);
      continue;
    }
    result.push(node);
    if (node === lastChild) result.push(moved);
  }
  return result;
}

function indentNode(
  nodes: readonly Node[],
  nodeId: number,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeIndentResult {
  const scan = scanSiblingNeighbors(nodes, nodeId, visibleNodeIds);
  switch (scan.kind) {
    case "node-missing":
    case "node-hidden":
      return { ok: false, reason: scan.kind };
    case "found":
      break;
    default: {
      const unreachable: never = scan;
      return unreachable;
    }
  }
  const { node: target, previousVisibleId, hiddenBefore } = scan.neighbors;
  if (previousVisibleId === null) {
    return {
      ok: false,
      reason: "at-edge",
      direction: "indent",
      hiddenBeyond: hiddenBefore,
      isRoot: target.parentId === null,
    };
  }
  const parent = indexFirstNodes(nodes).get(previousVisibleId);
  if (parent === undefined || !canConnectNodes(nodes, parent.id, target.id)) {
    return { ok: false, reason: "invalid-structure" };
  }

  const placed = applyBranchPlacement(
    buildIndentedNodes(nodes, target, parent),
    target.id,
    mode,
    () => calculateIndentTranslation(nodes, target.id, parent.id),
  );
  if (placed === null) return { ok: false, reason: "placement-failed" };
  const depth = measureDepth(placed, target.id);
  if (depth === null) return { ok: false, reason: "invalid-structure" };
  return {
    ok: true,
    direction: "indent",
    nodes: placed,
    newParentId: parent.id,
    newParentLabel: parent.label,
    depth,
  };
}

// T を元の親 P の直後へ移し、P の親（祖父母）の子にする。T 以外は同じオブジェクトのまま積む
function buildOutdentedNodes(nodes: readonly Node[], target: Node, parent: Node): Node[] {
  const moved: Node = { ...target, parentId: parent.parentId };
  const result: Node[] = [];
  for (const node of nodes) {
    if (node === target) continue;
    result.push(node);
    if (node === parent) result.push(moved);
  }
  return result;
}

function outdentNode(
  nodes: readonly Node[],
  nodeId: number,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeIndentResult {
  const nodesById = indexFirstNodes(nodes);
  const target = nodesById.get(nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  if (!visibleNodeIds.has(target.id)) return { ok: false, reason: "node-hidden" };
  if (target.parentId === null) return { ok: false, reason: "at-edge", direction: "outdent" };
  const parent = nodesById.get(target.parentId);
  if (parent === undefined) return { ok: false, reason: "invalid-structure" };
  let newParentLabel: string | null = null;
  if (parent.parentId !== null) {
    const grandparent = nodesById.get(parent.parentId);
    if (grandparent === undefined) return { ok: false, reason: "invalid-structure" };
    newParentLabel = grandparent.label;
  }

  const placed = applyBranchPlacement(
    buildOutdentedNodes(nodes, target, parent),
    target.id,
    mode,
    () => calculateOutdentTranslation(nodes, target.id, parent.id),
  );
  if (placed === null) return { ok: false, reason: "placement-failed" };
  const depth = measureDepth(placed, target.id);
  if (depth === null) return { ok: false, reason: "invalid-structure" };
  return {
    ok: true,
    direction: "outdent",
    nodes: placed,
    newParentId: parent.parentId,
    newParentLabel,
    depth,
  };
}

export function changeNodeIndent(
  nodes: readonly Node[],
  nodeId: number,
  direction: NodeIndentDirection,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeIndentResult {
  switch (direction) {
    case "indent":
      return indentNode(nodes, nodeId, visibleNodeIds, mode);
    case "outdent":
      return outdentNode(nodes, nodeId, visibleNodeIds, mode);
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}
