import type { AiAssistKind } from "@/domain/aiAssist/aiAssistEntryAvailability";
import { AI_SUMMARY_MAX_NODES, aiBranchInputFingerprint, buildAiBranchInput } from "@/domain/aiAssist/aiBranchInput";
import type { ImportanceSuggestion } from "@/domain/aiAssist/aiAssistOutput";
import type { NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { NODE_NOTE_MAX_LENGTH, NODE_NOTE_MERGE_JOINER, normalizeNodeNote, withNodeNote } from "@/domain/nodes/nodeNote";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export type AiStructureProposalKind =
  | "add-child"
  | "add-sibling"
  | "reparent"
  | "reorder-siblings"
  | "merge-pair";

// AI の提案 1 件。baseline は提案を作った時点の値で、採用の時点の値と ID と値の組で照合する（L-036）
export type AiProposal =
  | {
    key: string; kind: "note"; nodeId: number;
    baseline: { note: string | undefined; inputFingerprint: string };
    summary: string;
  }
  | {
    key: string; kind: "importance"; nodeId: number;
    baseline: { importance: NodeImportance; label: string }; // label は抜粋前の元のラベル全文
    proposed: NodeImportance; reason: string;
  }
  | {
    key: string; kind: "add-child"; parentId: number; label: string;
    baseline: { parentId: number; inputFingerprint: string; assistKind: AiAssistKind };
  }
  | {
    key: string; kind: "add-sibling"; anchorId: number; label: string;
    baseline: { anchorId: number; parentId: number | null; inputFingerprint: string; assistKind: AiAssistKind };
  }
  | {
    key: string; kind: "reparent"; nodeId: number; newParentId: number;
    baseline: {
      nodeId: number; oldParentId: number | null; label: string;
      inputFingerprint: string; assistKind: AiAssistKind;
    };
  }
  | {
    key: string; kind: "reorder-siblings"; parentId: number; childIds: readonly number[];
    baseline: {
      parentId: number; childIdsBefore: readonly number[];
      inputFingerprint: string; assistKind: AiAssistKind;
    };
  }
  | {
    key: string; kind: "merge-pair"; primaryId: number; secondaryId: number; reason: string;
    baseline: {
      primaryId: number; secondaryId: number;
      primaryLabel: string; secondaryLabel: string; parentId: number | null;
      inputFingerprint: string; assistKind: AiAssistKind;
    };
    expectedPlan: Extract<NodeMergePlan, { ok: true }>;
  };

export type AiProposalDecision = "undecided" | "accepted" | "rejected";
export type NoteApplyMode = "replace" | "append";

export type AcceptedAiProposal =
  | { proposal: Extract<AiProposal, { kind: "note" }>; mode: NoteApplyMode }
  | { proposal: Extract<AiProposal, { kind: "importance" }> };

export type ApplyAiProposalsResult =
  | { ok: true; nodes: Node[]; appliedCount: number }
  | { ok: false; reason: "stale"; staleKeys: string[] }
  | { ok: false; reason: "note-too-long" | "nothing-to-apply" };

// useNodes.applyAiProposals の戻り値。"rejected" は、ドメインは成功したが applyNonStructuralChange が false を返した
// （関連線・グループの選択中など）
export type AiProposalsApplyOutcome =
  | { ok: true; appliedCount: number }
  | { ok: false; reason: "stale"; staleKeys: string[] }
  | { ok: false; reason: "note-too-long" | "nothing-to-apply" | "rejected" };

export function noteProposalKey(nodeId: number): string {
  return `note:${nodeId}`;
}

export function importanceProposalKey(nodeId: number): string {
  return `importance:${nodeId}`;
}

// 要約の提案の鮮度の照合に使う指紋。作り直せない（根が無い・大きすぎる）なら null（古いとみなす）
export function summaryInputFingerprintOf(nodes: readonly Node[], rootId: number): string | null {
  const result = buildAiBranchInput(nodes, rootId, { includeRootNote: false, maxNodes: AI_SUMMARY_MAX_NODES });
  return result.ok ? aiBranchInputFingerprint(result.input) : null;
}

export function planNoteFromSummary(
  current: string | undefined,
  summary: string,
  mode: NoteApplyMode,
): { ok: true; note: string } | { ok: false; reason: "note-too-long" } {
  const raw = mode === "append" && current !== undefined ? `${current}${NODE_NOTE_MERGE_JOINER}${summary}` : summary;
  const note = normalizeNodeNote(raw) ?? "";
  if (note.length > NODE_NOTE_MAX_LENGTH) return { ok: false, reason: "note-too-long" };
  return { ok: true, note };
}

// 既定は既存の内容を失わない側。メモが無ければ置き換えだけ。追記で上限を超えるなら未選択（利用者が置き換えを選ぶ）
export function defaultNoteApplyMode(current: string | undefined, summary: string): NoteApplyMode | null {
  if (current === undefined) return "replace";
  return planNoteFromSummary(current, summary, "append").ok ? "append" : null;
}

export function buildNoteProposal(
  nodes: readonly Node[],
  rootId: number,
  inputFingerprint: string,
  summary: string,
): Extract<AiProposal, { kind: "note" }> | null {
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return null;
  return {
    key: noteProposalKey(rootId),
    kind: "note",
    nodeId: rootId,
    baseline: { note: root.note, inputFingerprint },
    summary,
  };
}

// 現在の重要度と違う提案だけを提案にする。対象（targetIds）の順に並べ、同じものと提案の無いものは件数だけ返す
export function buildImportanceProposals(
  nodes: readonly Node[],
  suggestions: readonly ImportanceSuggestion[],
  targetIds: readonly number[],
): { proposals: Extract<AiProposal, { kind: "importance" }>[]; unchangedCount: number; missingCount: number } {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const suggestionsById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
  const proposals: Extract<AiProposal, { kind: "importance" }>[] = [];
  let unchangedCount = 0;
  let missingCount = 0;
  for (const id of targetIds) {
    const node = nodesById.get(id);
    const suggestion = suggestionsById.get(id);
    if (node === undefined || suggestion === undefined) {
      missingCount += 1;
      continue;
    }
    if (suggestion.importance === node.importance) {
      unchangedCount += 1;
      continue;
    }
    proposals.push({
      key: importanceProposalKey(id),
      kind: "importance",
      nodeId: id,
      baseline: { importance: node.importance, label: node.label },
      proposed: suggestion.importance,
      reason: suggestion.reason,
    });
  }
  return { proposals, unchangedCount, missingCount };
}

function isStale(
  proposal: AiProposal,
  nodesById: ReadonlyMap<number, Node>,
  nodes: readonly Node[],
  rebuildInputFingerprint: (rootId: number) => string | null,
): boolean {
  if (proposal.kind !== "note" && proposal.kind !== "importance") return true;
  const node = nodesById.get(proposal.nodeId);
  if (node === undefined || !assertNodesEditable([proposal.nodeId], nodes).ok) return true;
  if (proposal.kind === "note") {
    return node.note !== proposal.baseline.note
      || rebuildInputFingerprint(proposal.nodeId) !== proposal.baseline.inputFingerprint;
  }
  return node.importance !== proposal.baseline.importance || node.label !== proposal.baseline.label;
}

export function findStaleAiProposals(
  nodes: readonly Node[],
  proposals: readonly AiProposal[],
  rebuildInputFingerprint: (rootId: number) => string | null,
): string[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return proposals
    .filter((proposal) => isStale(proposal, nodesById, nodes, rebuildInputFingerprint))
    .map((proposal) => proposal.key);
}

// 照合 → 全件の事前検証 → ノード配列を 1 回だけ作り直す（L-062・L-063）
export function applyAiProposals(
  nodes: readonly Node[],
  accepted: readonly AcceptedAiProposal[],
  rebuildInputFingerprint: (rootId: number) => string | null,
): ApplyAiProposalsResult {
  if (accepted.length === 0) return { ok: false, reason: "nothing-to-apply" };
  const staleKeys = findStaleAiProposals(nodes, accepted.map((item) => item.proposal), rebuildInputFingerprint);
  if (staleKeys.length > 0) return { ok: false, reason: "stale", staleKeys };

  const notesById = new Map<number, string>();
  const importanceById = new Map<number, NodeImportance>();
  for (const item of accepted) {
    if ("mode" in item) {
      const plan = planNoteFromSummary(item.proposal.baseline.note, item.proposal.summary, item.mode);
      if (!plan.ok) return { ok: false, reason: "note-too-long" };
      notesById.set(item.proposal.nodeId, plan.note);
    } else {
      importanceById.set(item.proposal.nodeId, item.proposal.proposed);
    }
  }

  let appliedCount = 0;
  const nextNodes = nodes.map((node) => {
    let updated = node;
    const note = notesById.get(node.id);
    if (note !== undefined && note !== node.note) {
      updated = withNodeNote(updated, note);
      appliedCount += 1;
    }
    const importance = importanceById.get(node.id);
    if (importance !== undefined && importance !== node.importance) {
      updated = { ...updated, importance };
      appliedCount += 1;
    }
    return updated;
  });
  if (appliedCount === 0) return { ok: false, reason: "nothing-to-apply" };
  return { ok: true, nodes: nextNodes, appliedCount };
}
