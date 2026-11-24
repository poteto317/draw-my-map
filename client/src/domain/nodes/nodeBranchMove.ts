import {
  type AllocateEntityIds,
  copyClosedRelationGroups,
  mergeRelationGroupSlices,
  pruneSourceAfterBranchMove,
} from "@/domain/map/relationGroupLifecycle";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import {
  DEFAULT_LAYOUT_NODE_FOREST_OPTIONS,
  layoutNodeForest,
  type LayoutNodeForestOptions,
} from "@/domain/nodes/nodeAutoLayout";
import { calculateIndentTranslation, translateBranch, type BranchTranslation } from "@/domain/nodes/nodeIndentPlacement";
import { calculateManualOffsetY } from "@/domain/nodes/nodeManualPlacement";
import { remapMovedBranchMapLinks } from "@/domain/nodes/nodeMapLink";
import { insertNodeSubtree } from "@/domain/nodes/nodeSubtreeInsertion";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import { resolveLayoutNodeForestOptions, resolveLayoutSpacing } from "@/domain/nodes/resolveLayoutSpacing";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";

export type { AllocateEntityIds };

export type BranchMoveFailureReason =
  | "missing-node"
  | "invalid-parent"
  | "same-parent"
  | "placement-failed"
  | "locked";

export type BranchMoveResult =
  | { ok: true; nodes: Node[]; rootId: number }
  | { ok: false; reason: BranchMoveFailureReason };

export type BranchTransferResult =
  | { ok: true; source: NodeMapState; target: NodeMapState; rootId: number }
  | { ok: false; reason: BranchMoveFailureReason };

type SplitBranch = {
  branchIds: ReadonlySet<number>;
  branch: Node[];
  remaining: Node[];
};

// 枝のノードから親をたどって、枝の中だけを通って根へ着くか
function reachesRootWithinBranch(
  node: Node,
  rootId: number,
  byId: ReadonlyMap<number, Node>,
  branchIds: ReadonlySet<number>,
): boolean {
  const visited = new Set<number>();
  let current: Node | undefined = node;
  while (current.id !== rootId) {
    if (visited.has(current.id) || current.parentId === null) return false;
    visited.add(current.id);
    current = byId.get(current.parentId);
    if (current === undefined || !branchIds.has(current.id)) return false;
  }
  return true;
}

function isValidBranch(nodes: readonly Node[], rootId: number, branchIds: ReadonlySet<number>): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(rootId);
  if (root === undefined) return false;
  if (root.parentId !== null && (!byId.has(root.parentId) || branchIds.has(root.parentId))) return false;

  return nodes.every((node) => !branchIds.has(node.id) || reachesRootWithinBranch(node, rootId, byId, branchIds));
}

// 枝と残りのノードへ分ける。親子関係が壊れた枝は null
function splitValidBranch(nodes: readonly Node[], rootId: number): SplitBranch | null {
  const branchIds = collectSubtreeIds(nodes, rootId);
  if (!isValidBranch(nodes, rootId, branchIds)) return null;
  return {
    branchIds,
    branch: nodes.filter((node) => branchIds.has(node.id)),
    remaining: nodes.filter((node) => !branchIds.has(node.id)),
  };
}

function layoutForMode(
  nodes: Node[],
  mode: NodeLayoutMode,
  layoutOptions: LayoutNodeForestOptions,
): Node[] | null {
  return mode === "auto" ? layoutNodeForest(nodes, layoutOptions) : nodes;
}

// 手動配置で根にする移動の平行移動。枝全体を残りのノードの下へ真下に移す
function calculateRootTranslation(
  branch: readonly Node[],
  remaining: readonly Node[],
  rootId: number,
  spacing: LayoutSpacing,
): BranchTranslation | null {
  const offsetY = calculateManualOffsetY(remaining, branch, spacing);
  const root = branch.find((node) => node.id === rootId);
  if (offsetY === null || root === undefined || !Number.isFinite(root.x) || !Number.isFinite(root.y + offsetY)) {
    return null;
  }
  return { rootX: root.x, rootY: root.y + offsetY, dx: 0, dy: offsetY };
}

function placeBranchManually(
  nodes: readonly Node[],
  { branch, remaining }: SplitBranch,
  rootId: number,
  parentId: number | null,
  spacing: LayoutSpacing,
): Node[] | null {
  const translation = parentId === null
    ? calculateRootTranslation(branch, remaining, rootId, spacing)
    : calculateIndentTranslation(nodes, rootId, parentId, spacing);
  const placed = translation === null ? null : translateBranch(nodes, rootId, translation);
  if (placed === null) return null;

  const placedById = new Map(placed.map((node) => [node.id, node]));
  return [
    ...remaining,
    ...branch.map((node) => {
      const positioned = placedById.get(node.id)!;
      return node.id === rootId ? { ...positioned, parentId } : positioned;
    }),
  ];
}

function placeBranch(
  nodes: readonly Node[],
  split: SplitBranch,
  rootId: number,
  parentId: number | null,
  mode: NodeLayoutMode,
  spacing: LayoutSpacing,
  layoutOptions: LayoutNodeForestOptions,
): Node[] | null {
  if (mode === "manual") return placeBranchManually(nodes, split, rootId, parentId, spacing);
  const rootChanged = split.branch.map((node) => node.id === rootId ? { ...node, parentId } : node);
  return layoutNodeForest([...split.remaining, ...rootChanged], layoutOptions);
}

// 枝を移せる親。枝の中のノードと今の親は選べない
export function listBranchMoveParentCandidates(nodes: readonly Node[], source: Node): Node[] {
  const branchIds = collectSubtreeIds(nodes, source.id);
  return nodes.filter((node) => !branchIds.has(node.id) && node.id !== source.parentId);
}

export function moveNodeBranch(
  nodes: readonly Node[],
  rootId: number,
  parentId: number | null,
  mode: NodeLayoutMode,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
  layoutOptions: LayoutNodeForestOptions = DEFAULT_LAYOUT_NODE_FOREST_OPTIONS,
): BranchMoveResult {
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return { ok: false, reason: "missing-node" };
  const branchIds = [...collectSubtreeIds(nodes, rootId)];
  const editableIds = [...branchIds];
  if (parentId !== null) editableIds.push(parentId);
  if (root.parentId !== null) editableIds.push(root.parentId);
  const lockedCheck = assertNodesEditable(editableIds, nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return { ok: false, reason: "locked" };
  if (root.parentId === parentId) return { ok: false, reason: "same-parent" };

  const split = splitValidBranch(nodes, rootId);
  if (split === null) return { ok: false, reason: "invalid-parent" };
  if (parentId !== null) {
    if (!nodes.some((node) => node.id === parentId) || split.branchIds.has(parentId)) {
      return { ok: false, reason: "invalid-parent" };
    }
  }

  const placed = placeBranch(nodes, split, rootId, parentId, mode, spacing, layoutOptions);
  return placed === null
    ? { ok: false, reason: "placement-failed" }
    : { ok: true, nodes: placed, rootId };
}

export type BranchTransferMapIds = {
  readonly sourceMapId: string;
  readonly targetMapId: string;
};

// 枝を別マップへ移す。移動先で ID を振り直すので、枝の中のノード同士を指すマップ間リンクは移動先マップ・新しい ID へ付け替える。
// 閉じた relation/group は remap して同行し、境界横断 relation・分割 group は捨てる。元マップは prune する
export function transferNodeBranch(
  source: NodeMapState,
  target: NodeMapState,
  rootId: number,
  allocateIds: AllocateEntityIds,
  mapIds: BranchTransferMapIds,
): BranchTransferResult {
  const root = source.nodes.find((node) => node.id === rootId);
  if (root === undefined) return { ok: false, reason: "missing-node" };
  const branchIds = [...collectSubtreeIds(source.nodes, rootId)];
  const lockedCheck = assertNodesEditable(branchIds, source.nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return { ok: false, reason: "locked" };

  const split = splitValidBranch(source.nodes, rootId);
  if (split === null) return { ok: false, reason: "invalid-parent" };
  const sourceLayoutOptions = resolveLayoutNodeForestOptions(source);
  const targetLayoutOptions = resolveLayoutNodeForestOptions(target);
  const targetSpacing = resolveLayoutSpacing(target);

  const nextSourceNodes = layoutForMode(split.remaining, source.layoutMode, sourceLayoutOptions);
  if (nextSourceNodes === null) return { ok: false, reason: "placement-failed" };

  const inserted = insertNodeSubtree(
    target.nodes,
    split.branch,
    rootId,
    null,
    target.layoutMode,
    (occupied, count) => allocateIds(
      { nodes: [...occupied], relations: target.relations, groups: target.groups },
      count,
    ),
    "paste",
    targetSpacing,
  );
  if (inserted === null) return { ok: false, reason: "placement-failed" };
  // 写した枝は配列の末尾に、元の枝と同じ順で並ぶ
  const copies = inserted.nodes.slice(target.nodes.length);
  const remappedCopies = remapMovedBranchMapLinks(
    copies,
    mapIds.sourceMapId,
    mapIds.targetMapId,
    inserted.nodeIdMapping,
  );
  const nextTargetNodes = layoutForMode(
    [...inserted.nodes.slice(0, target.nodes.length), ...remappedCopies],
    target.layoutMode,
    targetLayoutOptions,
  );
  if (nextTargetNodes === null) return { ok: false, reason: "placement-failed" };

  const pruned = pruneSourceAfterBranchMove(source.relations, source.groups, branchIds);
  const closedCopied = copyClosedRelationGroups(
    source.relations,
    source.groups,
    inserted.nodeIdMapping,
    { nodes: nextTargetNodes, relations: target.relations, groups: target.groups },
    allocateIds,
  );
  const merged = mergeRelationGroupSlices(target, closedCopied);

  return {
    ok: true,
    source: {
      ...source,
      nodes: nextSourceNodes,
      relations: pruned.relations,
      groups: pruned.groups,
    },
    target: {
      ...target,
      nodes: nextTargetNodes,
      relations: merged.relations,
      groups: merged.groups,
    },
    rootId: inserted.rootId,
  };
}
