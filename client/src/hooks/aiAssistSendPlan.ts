import {
  resolveAiAssistEntryAvailability,
  type AiAssistEntryBlockers,
  type AiAssistKind,
} from "@/domain/aiAssist/aiAssistEntryAvailability";
import type {
  AiClassifyMove,
  ChildCandidate,
  DuplicatePair,
  ImportanceSuggestion,
  MissingPerspectiveItem,
} from "@/domain/aiAssist/aiAssistOutput";
import {
  AI_BRANCH_MAX_TOTAL_LENGTH,
  AI_CHILD_CANDIDATES_MAX_NODES,
  AI_CLASSIFY_REORDER_MAX_NODES,
  AI_DUPLICATES_MAX_NODES,
  AI_IMPORTANCE_MAX_NODES,
  AI_MISSING_PERSPECTIVES_MAX_NODES,
  AI_SUMMARY_MAX_NODES,
  aiBranchInputFingerprint,
  aiBranchRootHasParent,
  aiStructureInputFingerprintOf,
  buildAiBranchInput,
  importanceTargetIds,
  type AiBranchInput,
} from "@/domain/aiAssist/aiBranchInput";
import { buildNoteProposal, buildImportanceProposals, defaultNoteApplyMode } from "@/domain/aiAssist/aiProposal";
import {
  buildChildCandidateProposals,
  buildClassifyReorderProposals,
  buildDuplicatePairProposals,
  buildMissingPerspectiveProposals,
} from "@/domain/aiAssist/aiStructureProposal";
import type { AiAssistReviewInput } from "@/hooks/aiAssistDialogState";
import type {
  AiAssistApi,
  AiAssistRequestOptions,
  ClassifyReorderSimLayout,
} from "@/services/aiAssist/aiAssistClient";
import type { Node } from "@/types/node";

type PlanBase = {
  input: AiBranchInput;
  // 送った時点のノード（提案の baseline に使う）
  nodes: readonly Node[];
  rootLabel: string;
  descendantCount: number;
  totalLength: number;
  truncatedCount: number;
};

export type StructureAssistKind =
  | "child-candidates"
  | "classify-reorder"
  | "duplicates"
  | "missing-perspectives";

type AttributeAssistKind = "branch-summary" | "importance";

export type AiAssistSendPlan =
  | (PlanBase & { ok: true; kind: "branch-summary"; fingerprint: string })
  | (PlanBase & { ok: true; kind: "importance"; targetIds: number[]; excludedLockedCount: number })
  | (PlanBase & { ok: true; kind: "child-candidates" })
  | (PlanBase & { ok: true; kind: "classify-reorder" })
  | (PlanBase & { ok: true; kind: "duplicates" })
  | (PlanBase & { ok: true; kind: "missing-perspectives" })
  | { ok: false; reason: string; rootLabel: string | null };

export const AI_ASSIST_SEND_MESSAGES = {
  nodeMissing: "選んだノードが見つかりません。閉じてから選び直してください。",
  tooManyNodes: (max: number) => `枝が大きすぎます（ノードが ${max} 件を超えています）。小さい枝を選んでください。`,
  tooLarge: `枝が大きすぎます（ラベルとメモの合計が ${AI_BRANCH_MAX_TOTAL_LENGTH.toLocaleString("ja-JP")} 文字を超えています）。小さい枝を選んでください。`,
};

function maxNodesForKind(kind: AiAssistKind): number {
  switch (kind) {
    case "branch-summary":
      return AI_SUMMARY_MAX_NODES;
    case "importance":
      return AI_IMPORTANCE_MAX_NODES;
    case "child-candidates":
      return AI_CHILD_CANDIDATES_MAX_NODES;
    case "missing-perspectives":
      return AI_MISSING_PERSPECTIVES_MAX_NODES;
    case "classify-reorder":
      return AI_CLASSIFY_REORDER_MAX_NODES;
    case "duplicates":
      return AI_DUPLICATES_MAX_NODES;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

function includeRootNoteForKind(kind: AiAssistKind): boolean {
  return kind !== "branch-summary";
}

function emptyStructureReview(): AiAssistReviewInput {
  return { proposals: [], unchangedCount: 0, missingCount: 0, noteModes: {} };
}

// 確認画面の表示と送信の両方で、最新の状態から入力を作り直す。入口の無効条件も同じ関数で確かめる
export function planAiAssistSend(
  kind: AiAssistKind,
  nodes: readonly Node[],
  rootId: number,
  blockers: AiAssistEntryBlockers,
): AiAssistSendPlan {
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return { ok: false, reason: AI_ASSIST_SEND_MESSAGES.nodeMissing, rootLabel: null };
  const entry = resolveAiAssistEntryAvailability(kind, nodes, [rootId], blockers);
  if (!entry.enabled) return { ok: false, reason: entry.reason, rootLabel: root.label };

  const maxNodes = maxNodesForKind(kind);
  const built = buildAiBranchInput(nodes, rootId, {
    includeRootNote: includeRootNoteForKind(kind),
    maxNodes,
  });
  if (!built.ok) {
    const reason = built.reason === "too-many-nodes"
      ? AI_ASSIST_SEND_MESSAGES.tooManyNodes(maxNodes)
      : built.reason === "too-large"
        ? AI_ASSIST_SEND_MESSAGES.tooLarge
        : AI_ASSIST_SEND_MESSAGES.nodeMissing;
    return { ok: false, reason, rootLabel: root.label };
  }
  const base: PlanBase = {
    input: built.input,
    nodes,
    rootLabel: root.label,
    descendantCount: built.input.nodes.length - 1,
    totalLength: built.totalLength,
    truncatedCount: built.truncatedCount,
  };
  if (kind === "branch-summary") {
    return { ...base, ok: true, kind, fingerprint: aiBranchInputFingerprint(built.input) };
  }
  if (kind === "importance") {
    const targetIds = importanceTargetIds(built.input, nodes);
    return { ...base, ok: true, kind, targetIds, excludedLockedCount: built.input.nodes.length - targetIds.length };
  }
  if (aiStructureInputFingerprintOf(nodes, rootId, kind) === null) {
    return { ok: false, reason: AI_ASSIST_SEND_MESSAGES.tooManyNodes(maxNodes), rootLabel: root.label };
  }
  return { ...base, ok: true, kind };
}

export function buildSummaryReview(
  plan: Extract<AiAssistSendPlan, { ok: true; kind: "branch-summary" }>,
  summary: string,
): AiAssistReviewInput {
  const proposal = buildNoteProposal(plan.nodes, plan.input.rootId, plan.fingerprint, summary);
  if (proposal === null) return { proposals: [], unchangedCount: 0, missingCount: 1, noteModes: {} };
  return {
    proposals: [proposal],
    unchangedCount: 0,
    missingCount: 0,
    noteModes: { [proposal.key]: defaultNoteApplyMode(proposal.baseline.note, summary) },
  };
}

export function buildImportanceReview(
  plan: Extract<AiAssistSendPlan, { ok: true; kind: "importance" }>,
  suggestions: readonly ImportanceSuggestion[],
): AiAssistReviewInput {
  const { proposals, unchangedCount, missingCount } = buildImportanceProposals(plan.nodes, suggestions, plan.targetIds);
  return { proposals, unchangedCount, missingCount, noteModes: {} };
}

export function buildChildCandidatesReview(
  plan: Extract<AiAssistSendPlan, { ok: true; kind: "child-candidates" }>,
  candidates: readonly ChildCandidate[],
): AiAssistReviewInput {
  const proposals = buildChildCandidateProposals(plan.nodes, plan.input.rootId, candidates);
  return { ...emptyStructureReview(), proposals };
}

export function buildMissingPerspectivesReview(
  plan: Extract<AiAssistSendPlan, { ok: true; kind: "missing-perspectives" }>,
  items: readonly MissingPerspectiveItem[],
): AiAssistReviewInput {
  const proposals = buildMissingPerspectiveProposals(plan.nodes, plan.input.rootId, items);
  return { ...emptyStructureReview(), proposals };
}

export function buildClassifyReorderReview(
  plan: Extract<AiAssistSendPlan, { ok: true; kind: "classify-reorder" }>,
  moves: readonly AiClassifyMove[],
): AiAssistReviewInput {
  const proposals = buildClassifyReorderProposals(plan.nodes, moves);
  return { ...emptyStructureReview(), proposals };
}

export function buildDuplicatesReview(
  plan: Extract<AiAssistSendPlan, { ok: true; kind: "duplicates" }>,
  pairs: readonly DuplicatePair[],
  visibleNodeIds: ReadonlySet<number>,
  currentMapId: string,
): AiAssistReviewInput {
  const proposals = buildDuplicatePairProposals(plan.nodes, pairs, visibleNodeIds, currentMapId);
  return { ...emptyStructureReview(), proposals };
}

export function isStructureAssistKind(kind: AiAssistKind): kind is StructureAssistKind {
  return kind === "child-candidates"
    || kind === "classify-reorder"
    || kind === "duplicates"
    || kind === "missing-perspectives";
}

export type AiAssistSendRequestContext = {
  readonly api: AiAssistApi;
  readonly nodes: readonly Node[];
  readonly visibleNodeIds: ReadonlySet<number>;
  readonly mapId: string;
  readonly classifyReorderLayout: ClassifyReorderSimLayout;
};

// 送信プランから API 呼び出しとレビュー入力の組み立てまで。フックは abort と state 更新だけ担う
export function requestAiAssistReview(
  plan: Extract<AiAssistSendPlan, { ok: true }>,
  context: AiAssistSendRequestContext,
  options: AiAssistRequestOptions,
): Promise<AiAssistReviewInput> {
  const { api, nodes, visibleNodeIds, mapId, classifyReorderLayout } = context;
  if (plan.kind === "branch-summary") {
    return api.requestBranchSummary(plan.input, options)
      .then((summary) => buildSummaryReview(plan, summary));
  }
  if (plan.kind === "importance") {
    return api.requestImportanceSuggestions(plan.input, plan.targetIds, options)
      .then((suggestions) => buildImportanceReview(plan, suggestions));
  }
  if (plan.kind === "child-candidates") {
    return api.requestChildCandidates(plan.input, options)
      .then((candidates) => buildChildCandidatesReview(plan, candidates));
  }
  if (plan.kind === "missing-perspectives") {
    return api.requestMissingPerspectives(plan.input, aiBranchRootHasParent(plan.input), options)
      .then((items) => buildMissingPerspectivesReview(plan, items));
  }
  if (plan.kind === "classify-reorder") {
    return api.requestClassifyReorder(plan.input, plan.nodes, classifyReorderLayout, options)
      .then((moves) => buildClassifyReorderReview(plan, moves));
  }
  return api.requestDuplicatePairs(
    plan.input,
    plan.nodes,
    visibleNodeIds,
    mapId,
    options,
  ).then((pairs) => buildDuplicatesReview(plan, pairs, visibleNodeIds, mapId));
}
