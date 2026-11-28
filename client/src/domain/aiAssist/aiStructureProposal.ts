import type { AiAssistKind } from "@/domain/aiAssist/aiAssistEntryAvailability";
import { aiStructureInputFingerprintOf } from "@/domain/aiAssist/aiBranchInput";
import type {
  AiClassifyMove,
  ChildCandidate,
  DuplicatePair,
  MissingPerspectiveItem,
} from "@/domain/aiAssist/aiAssistOutput";
import type { AiProposal } from "@/domain/aiAssist/aiProposal";
import { rewriteAfterNodeMerge } from "@/domain/map/relationGroupLifecycle";
import { rewriteBranchLayoutsAfterNodeMerge } from "@/domain/map/branchLayoutLifecycle";
import {
  layoutNodeForest,
  type LayoutNodeForestOptions,
} from "@/domain/nodes/nodeAutoLayout";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { insertSiblingAfter } from "@/domain/nodes/insertSiblingAfter";
import { layoutNodesIfHeightsChanged } from "@/domain/nodes/layoutNodesIfHeightsChanged";
import { moveNodeBranch } from "@/domain/nodes/nodeBranchMove";
import {
  isSameNodeMergePlan,
  mergeNodes as computeNodeMerge,
  planNodeMerge,
} from "@/domain/nodes/nodeMerge";
import {
  resolveLayoutNodeForestOptions,
  resolveLayoutSpacing,
} from "@/domain/nodes/nodeMapLayoutContext";
import {
  fitNodeHeightToLabel,
  fitNodeHeightToLabelIfContentChanged,
} from "@/domain/nodes/nodeLabelLayout";
import { createChildNode } from "@/domain/nodes/nodePlacement";
import { MERGE_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import {
  directChildIdsInArrayOrder,
  reorderAllSiblings,
} from "@/domain/nodes/reorderAllSiblings";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

export type StructureAiProposal = Extract<
  AiProposal,
  { kind: "add-child" | "add-sibling" | "reparent" | "reorder-siblings" | "merge-pair" }
>;

export type AcceptedAiStructureProposal =
  | { proposal: Extract<AiProposal, { kind: "add-child" | "add-sibling" | "reparent" | "reorder-siblings" }> }
  | { proposal: Extract<AiProposal, { kind: "merge-pair" }> };

export type ApplyAiStructureProposalsResult =
  | { ok: true; state: NodeMapState; appliedCount: number }
  | { ok: false; reason: "stale"; staleKeys: string[] }
  | { ok: false; reason: "nothing-to-apply" | "placement-failed" };

// useNodes.applyAiStructureProposals の戻り値
export type AiStructureApplyOutcome =
  | { ok: true; appliedCount: number }
  | { ok: false; reason: "stale"; staleKeys: string[] }
  | { ok: false; reason: "nothing-to-apply" | "placement-failed" | "rejected" };

const STRUCTURE_KIND_SORT: Record<StructureAiProposal["kind"], number> = {
  "merge-pair": 0,
  reparent: 1,
  "reorder-siblings": 2,
  "add-child": 3,
  "add-sibling": 3,
};

export function addChildProposalKey(parentId: number, label: string, index: number): string {
  return `add-child:${parentId}:${index}:${label}`;
}

export function addSiblingProposalKey(anchorId: number, label: string, index: number): string {
  return `add-sibling:${anchorId}:${index}:${label}`;
}

export function reparentProposalKey(nodeId: number, newParentId: number): string {
  return `reparent:${nodeId}:${newParentId}`;
}

export function reorderSiblingsProposalKey(parentId: number, childIds: readonly number[]): string {
  return `reorder:${parentId}:${childIds.join(",")}`;
}

export function mergePairProposalKey(primaryId: number, secondaryId: number): string {
  return `merge:${primaryId}:${secondaryId}`;
}

function fingerprintRootForKind(proposal: StructureAiProposal): number {
  switch (proposal.kind) {
    case "add-child":
      return proposal.baseline.parentId;
    case "add-sibling":
      return proposal.baseline.anchorId;
    case "reparent":
      return proposal.baseline.nodeId;
    case "reorder-siblings":
      return proposal.baseline.parentId;
    case "merge-pair":
      return proposal.baseline.primaryId;
    default: {
      const neverKind: never = proposal;
      return neverKind;
    }
  }
}

function isStructureProposalStale(
  proposal: StructureAiProposal,
  state: NodeMapState,
  rebuildInputFingerprint: (rootId: number, kind: AiAssistKind) => string | null,
): boolean {
  const { nodes } = state;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const rootId = fingerprintRootForKind(proposal);
  const fingerprint = rebuildInputFingerprint(rootId, proposal.baseline.assistKind);
  if (fingerprint !== proposal.baseline.inputFingerprint) return true;

  switch (proposal.kind) {
    case "add-child": {
      const parent = nodesById.get(proposal.baseline.parentId);
      if (parent === undefined || !assertNodesEditable([proposal.baseline.parentId], nodes).ok) return true;
      return false;
    }
    case "add-sibling": {
      const anchor = nodesById.get(proposal.baseline.anchorId);
      if (anchor === undefined || !assertNodesEditable([proposal.baseline.anchorId], nodes).ok) return true;
      return anchor.parentId !== proposal.baseline.parentId;
    }
    case "reparent": {
      const node = nodesById.get(proposal.baseline.nodeId);
      if (node === undefined || !assertNodesEditable([proposal.baseline.nodeId], nodes).ok) return true;
      return node.parentId !== proposal.baseline.oldParentId || node.label !== proposal.baseline.label;
    }
    case "reorder-siblings": {
      const parent = nodesById.get(proposal.baseline.parentId);
      if (parent === undefined || !assertNodesEditable([proposal.baseline.parentId], nodes).ok) return true;
      const current = directChildIdsInArrayOrder(nodes, proposal.baseline.parentId);
      return current.length !== proposal.baseline.childIdsBefore.length
        || current.some((id, index) => id !== proposal.baseline.childIdsBefore[index]);
    }
    case "merge-pair": {
      const primary = nodesById.get(proposal.baseline.primaryId);
      const secondary = nodesById.get(proposal.baseline.secondaryId);
      if (
        primary === undefined
        || secondary === undefined
        || !assertNodesEditable([proposal.baseline.primaryId, proposal.baseline.secondaryId], nodes).ok
      ) {
        return true;
      }
      if (
        primary.label !== proposal.baseline.primaryLabel
        || secondary.label !== proposal.baseline.secondaryLabel
        || primary.parentId !== proposal.baseline.parentId
        || secondary.parentId !== proposal.baseline.parentId
      ) {
        return true;
      }
      return false;
    }
    default: {
      const neverKind: never = proposal;
      return neverKind;
    }
  }
}

export function findStaleAiStructureProposals(
  state: NodeMapState,
  proposals: readonly StructureAiProposal[],
  rebuildInputFingerprint: (rootId: number, kind: AiAssistKind) => string | null,
): string[] {
  return proposals
    .filter((proposal) => isStructureProposalStale(proposal, state, rebuildInputFingerprint))
    .map((proposal) => proposal.key);
}

function sortStructureProposals(accepted: readonly AcceptedAiStructureProposal[]): AcceptedAiStructureProposal[] {
  return accepted
    .map((item, originalIndex) => ({ item, originalIndex, sort: STRUCTURE_KIND_SORT[item.proposal.kind] }))
  .sort((a, b) => a.sort - b.sort || a.originalIndex - b.originalIndex)
    .map(({ item }) => item);
}

function insertChildNode(
  nodes: readonly Node[],
  parentId: number,
  newId: number,
  label: string,
  spacing: ReturnType<typeof resolveLayoutSpacing>,
  mode: NodeMapState["layoutMode"],
  layoutOptions: LayoutNodeForestOptions,
): { ok: true; nodes: Node[] } | { ok: false } {
  if (!assertNodesEditable([parentId], nodes).ok) return { ok: false };
  const parent = nodes.find((node) => node.id === parentId);
  if (parent === undefined) return { ok: false };
  const created = createChildNode(nodes, parentId, newId, spacing);
  if (created === null) return { ok: false };
  // layout の入力は高さなので、配置前に commit fit する
  const newNode: Node = fitNodeHeightToLabel({ ...created, label }, "commit");
  const next = [...nodes, newNode];
  if (mode === "auto") {
    const laid = layoutNodeForest(next, layoutOptions);
    if (laid === null) return { ok: false };
    return { ok: true, nodes: laid };
  }
  return { ok: true, nodes: next };
}

export function applyAiStructureProposals(args: {
  state: NodeMapState;
  accepted: readonly AcceptedAiStructureProposal[];
  rebuildInputFingerprint: (rootId: number, kind: AiAssistKind) => string | null;
  allocateNodeIds: (count: number) => readonly number[];
  mergeJoiner: string;
  visibleNodeIds: ReadonlySet<number>;
  currentMapId: string;
}): ApplyAiStructureProposalsResult {
  const {
    state,
    accepted,
    rebuildInputFingerprint,
    allocateNodeIds,
    mergeJoiner,
    visibleNodeIds,
    currentMapId,
  } = args;
  if (accepted.length === 0) return { ok: false, reason: "nothing-to-apply" };

  const proposals = accepted.map((item) => item.proposal);
  const staleKeys = findStaleAiStructureProposals(state, proposals, rebuildInputFingerprint);
  if (staleKeys.length > 0) return { ok: false, reason: "stale", staleKeys };

  const sorted = sortStructureProposals(accepted);
  const layoutOptions = resolveLayoutNodeForestOptions(state);
  const spacing = resolveLayoutSpacing(state);
  let working: NodeMapState = {
    ...state,
    nodes: [...state.nodes],
    relations: state.relations ? [...state.relations] : undefined,
    groups: state.groups ? [...state.groups] : undefined,
    branchLayouts: state.branchLayouts ? [...state.branchLayouts] : undefined,
  };

  const addIdsNeeded = sorted.filter((item) => item.proposal.kind === "add-child" || item.proposal.kind === "add-sibling").length;
  const allocatedIds = [...allocateNodeIds(addIdsNeeded)];
  let nextAddIndex = 0;
  let appliedCount = 0;

  for (const item of sorted) {
    const proposal = item.proposal;
    switch (proposal.kind) {
      case "merge-pair": {
        const fresh = planNodeMerge(
          working.nodes,
          [proposal.primaryId, proposal.secondaryId],
          proposal.primaryId,
          mergeJoiner,
          visibleNodeIds,
          currentMapId,
        );
        if (!fresh.ok || !isSameNodeMergePlan(fresh, proposal.expectedPlan)) {
          return { ok: false, reason: "placement-failed" };
        }
        const merged = computeNodeMerge(
          working.nodes,
          [proposal.primaryId, proposal.secondaryId],
          proposal.primaryId,
          mergeJoiner,
          visibleNodeIds,
          working.layoutMode,
          currentMapId,
        );
        if (!merged.ok) return { ok: false, reason: "placement-failed" };
        const rewritten = rewriteAfterNodeMerge(
          merged.survivorId,
          merged.absorbedIds,
          working.relations,
          working.groups,
        );
        const rewrittenBranchLayouts = rewriteBranchLayoutsAfterNodeMerge(
          merged.survivorId,
          merged.absorbedIds,
          working.branchLayouts,
        );
        working = {
          ...working,
          nodes: merged.nodes,
          relations: rewritten.relations,
          groups: rewritten.groups,
          branchLayouts: rewrittenBranchLayouts,
        };
        appliedCount += 1;
        break;
      }
      case "reparent": {
        const moved = moveNodeBranch(
          working.nodes,
          proposal.nodeId,
          proposal.newParentId,
          working.layoutMode,
          spacing,
          layoutOptions,
        );
        if (!moved.ok) return { ok: false, reason: "placement-failed" };
        working = { ...working, nodes: moved.nodes };
        appliedCount += 1;
        break;
      }
      case "reorder-siblings": {
        const reordered = reorderAllSiblings(
          working.nodes,
          proposal.parentId,
          proposal.childIds,
          working.layoutMode,
          layoutOptions,
        );
        if (!reordered.ok) {
          if (reordered.reason === "unchanged") continue;
          return { ok: false, reason: "placement-failed" };
        }
        working = { ...working, nodes: reordered.nodes };
        appliedCount += 1;
        break;
      }
      case "add-child": {
        const newId = allocatedIds[nextAddIndex];
        if (newId === undefined) return { ok: false, reason: "placement-failed" };
        nextAddIndex += 1;
        const inserted = insertChildNode(
          working.nodes,
          proposal.parentId,
          newId,
          proposal.label,
          spacing,
          working.layoutMode,
          layoutOptions,
        );
        if (!inserted.ok) return { ok: false, reason: "placement-failed" };
        working = { ...working, nodes: inserted.nodes };
        appliedCount += 1;
        break;
      }
      case "add-sibling": {
        const newId = allocatedIds[nextAddIndex];
        if (newId === undefined) return { ok: false, reason: "placement-failed" };
        nextAddIndex += 1;
        const inserted = insertSiblingAfter(
          working.nodes,
          proposal.anchorId,
          newId,
          proposal.label,
          working.layoutMode,
          spacing,
          layoutOptions,
        );
        if (!inserted.ok) return { ok: false, reason: "placement-failed" };
        working = { ...working, nodes: inserted.nodes };
        appliedCount += 1;
        break;
      }
      default: {
        const neverKind: never = proposal;
        return neverKind;
      }
    }
  }

  if (appliedCount === 0) return { ok: false, reason: "nothing-to-apply" };
  if (
    working.nodes === state.nodes
    && working.relations === state.relations
    && working.groups === state.groups
    && working.branchLayouts === state.branchLayouts
  ) {
    return { ok: false, reason: "nothing-to-apply" };
  }

  const previousById = new Map(state.nodes.map((node) => [node.id, node]));
  const fittedNodes = working.nodes.map((node) =>
    fitNodeHeightToLabelIfContentChanged(previousById.get(node.id), node, "commit"),
  );
  // merge 等で高さだけ伸びたあと、auto なら兄弟間隔も layout で閉じる
  const laid = layoutNodesIfHeightsChanged(
    working.nodes,
    fittedNodes,
    working.layoutMode,
    layoutOptions,
  );
  if (laid === null) return { ok: false, reason: "placement-failed" };
  return { ok: true, state: { ...working, nodes: laid }, appliedCount };
}

export function structureInputFingerprintOf(
  nodes: readonly Node[],
  rootId: number,
  kind: AiAssistKind,
): string | null {
  return aiStructureInputFingerprintOf(nodes, rootId, kind);
}

function nodeLabel(nodes: readonly Node[], nodeId: number): string {
  return nodes.find((node) => node.id === nodeId)?.label ?? "";
}

export function buildChildCandidateProposals(
  nodes: readonly Node[],
  rootId: number,
  candidates: readonly ChildCandidate[],
): StructureAiProposal[] {
  const fingerprint = aiStructureInputFingerprintOf(nodes, rootId, "child-candidates");
  if (fingerprint === null) return [];
  return candidates.map((candidate, index) => ({
    key: addChildProposalKey(rootId, candidate.label, index),
    kind: "add-child",
    parentId: rootId,
    label: candidate.label,
    baseline: { parentId: rootId, inputFingerprint: fingerprint, assistKind: "child-candidates" },
  }));
}

export function buildMissingPerspectiveProposals(
  nodes: readonly Node[],
  rootId: number,
  items: readonly MissingPerspectiveItem[],
): StructureAiProposal[] {
  const fingerprint = aiStructureInputFingerprintOf(nodes, rootId, "missing-perspectives");
  if (fingerprint === null) return [];
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return [];
  return items.flatMap((item, index): StructureAiProposal[] => {
    if (item.placement === "child") {
      return [{
        key: addChildProposalKey(rootId, item.label, index),
        kind: "add-child",
        parentId: rootId,
        label: item.label,
        baseline: { parentId: rootId, inputFingerprint: fingerprint, assistKind: "missing-perspectives" },
      }];
    }
    return [{
      key: addSiblingProposalKey(rootId, item.label, index),
      kind: "add-sibling",
      anchorId: rootId,
      label: item.label,
      baseline: {
        anchorId: rootId,
        parentId: root.parentId,
        inputFingerprint: fingerprint,
        assistKind: "missing-perspectives",
      },
    }];
  });
}

export function buildClassifyReorderProposals(
  nodes: readonly Node[],
  moves: readonly AiClassifyMove[],
): StructureAiProposal[] {
  return moves.flatMap((move): StructureAiProposal[] => {
    if (move.type === "reparent") {
      const target = nodes.find((node) => node.id === move.nodeId);
      if (target === undefined) return [];
      const fingerprint = aiStructureInputFingerprintOf(nodes, move.nodeId, "classify-reorder");
      if (fingerprint === null) return [];
      return [{
        key: reparentProposalKey(move.nodeId, move.newParentId),
        kind: "reparent",
        nodeId: move.nodeId,
        newParentId: move.newParentId,
        baseline: {
          nodeId: move.nodeId,
          oldParentId: target.parentId,
          label: target.label,
          inputFingerprint: fingerprint,
          assistKind: "classify-reorder",
        },
      }];
    }
    const fingerprint = aiStructureInputFingerprintOf(nodes, move.parentId, "classify-reorder");
    if (fingerprint === null) return [];
    return [{
      key: reorderSiblingsProposalKey(move.parentId, move.childIds),
      kind: "reorder-siblings",
      parentId: move.parentId,
      childIds: move.childIds,
      baseline: {
        parentId: move.parentId,
        childIdsBefore: directChildIdsInArrayOrder(nodes, move.parentId),
        inputFingerprint: fingerprint,
        assistKind: "classify-reorder",
      },
    }];
  });
}

export function buildDuplicatePairProposals(
  nodes: readonly Node[],
  pairs: readonly DuplicatePair[],
  visibleNodeIds: ReadonlySet<number>,
  currentMapId: string,
): StructureAiProposal[] {
  return pairs.flatMap((pair): StructureAiProposal[] => {
    const primary = nodes.find((node) => node.id === pair.primaryId);
    const secondary = nodes.find((node) => node.id === pair.secondaryId);
    if (primary === undefined || secondary === undefined) return [];
    const expectedPlan = planNodeMerge(
      nodes,
      [pair.primaryId, pair.secondaryId],
      pair.primaryId,
      MERGE_DEFAULT_SEPARATOR,
      visibleNodeIds,
      currentMapId,
    );
    if (!expectedPlan.ok) return [];
    const fingerprint = aiStructureInputFingerprintOf(nodes, pair.primaryId, "duplicates");
    if (fingerprint === null) return [];
    return [{
      key: mergePairProposalKey(pair.primaryId, pair.secondaryId),
      kind: "merge-pair",
      primaryId: pair.primaryId,
      secondaryId: pair.secondaryId,
      reason: pair.reason,
      baseline: {
        primaryId: pair.primaryId,
        secondaryId: pair.secondaryId,
        primaryLabel: primary.label,
        secondaryLabel: secondary.label,
        parentId: primary.parentId,
        inputFingerprint: fingerprint,
        assistKind: "duplicates",
      },
      expectedPlan,
    }];
  });
}

export const AI_MERGE_ATTRIBUTES_HINT =
  "ラベル以外の属性は既存の統合規則に従います。";

export function describeStructureProposal(nodes: readonly Node[], proposal: StructureAiProposal): string {
  switch (proposal.kind) {
    case "add-child": {
      const parentLabel = formatPreviewStructureLabel(nodeLabel(nodes, proposal.parentId));
      return `「${parentLabel}」の下に子「${formatPreviewStructureLabel(proposal.label)}」を追加`;
    }
    case "add-sibling": {
      const anchorLabel = formatPreviewStructureLabel(nodeLabel(nodes, proposal.anchorId));
      return `「${anchorLabel}」の直後に兄弟「${formatPreviewStructureLabel(proposal.label)}」を追加`;
    }
    case "reparent": {
      const oldParent = proposal.baseline.oldParentId === null
        ? "（ルート）"
        : formatPreviewStructureLabel(nodeLabel(nodes, proposal.baseline.oldParentId));
      const newParent = formatPreviewStructureLabel(nodeLabel(nodes, proposal.newParentId));
      const target = formatPreviewStructureLabel(proposal.baseline.label);
      return `「${target}」を ${oldParent} から「${newParent}」の下へ移動`;
    }
    case "reorder-siblings": {
      const parent = formatPreviewStructureLabel(nodeLabel(nodes, proposal.parentId));
      return `「${parent}」の子の並べ替え`;
    }
    case "merge-pair": {
      const primary = formatPreviewStructureLabel(proposal.baseline.primaryLabel);
      const secondary = formatPreviewStructureLabel(proposal.baseline.secondaryLabel);
      const reason = proposal.reason === "" ? "" : `（${proposal.reason}）`;
      return `「${primary}」に「${secondary}」を統合${reason}`;
    }
    default: {
      const neverKind: never = proposal;
      return neverKind;
    }
  }
}

function formatPreviewStructureLabel(label: string): string {
  return label.trim() === "" ? "（ラベルなし）" : label;
}