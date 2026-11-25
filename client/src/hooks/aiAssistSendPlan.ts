import {
  resolveAiAssistEntryAvailability,
  type AiAssistEntryBlockers,
  type AiAssistKind,
} from "@/domain/aiAssist/aiAssistEntryAvailability";
import type { ImportanceSuggestion } from "@/domain/aiAssist/aiAssistOutput";
import {
  AI_BRANCH_MAX_TOTAL_LENGTH,
  AI_IMPORTANCE_MAX_NODES,
  AI_SUMMARY_MAX_NODES,
  aiBranchInputFingerprint,
  buildAiBranchInput,
  importanceTargetIds,
  type AiBranchInput,
} from "@/domain/aiAssist/aiBranchInput";
import { buildImportanceProposals, buildNoteProposal, defaultNoteApplyMode } from "@/domain/aiAssist/aiProposal";
import type { AiAssistReviewInput } from "@/hooks/aiAssistDialogState";
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

export type AiAssistSendPlan =
  | (PlanBase & { ok: true; kind: "branch-summary"; fingerprint: string })
  | (PlanBase & { ok: true; kind: "importance"; targetIds: number[]; excludedLockedCount: number })
  | { ok: false; reason: string; rootLabel: string | null };

export const AI_ASSIST_SEND_MESSAGES = {
  nodeMissing: "選んだノードが見つかりません。閉じてから選び直してください。",
  tooManyNodes: (max: number) => `枝が大きすぎます（ノードが ${max} 件を超えています）。小さい枝を選んでください。`,
  tooLarge: `枝が大きすぎます（ラベルとメモの合計が ${AI_BRANCH_MAX_TOTAL_LENGTH.toLocaleString("ja-JP")} 文字を超えています）。小さい枝を選んでください。`,
};

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

  const maxNodes = kind === "branch-summary" ? AI_SUMMARY_MAX_NODES : AI_IMPORTANCE_MAX_NODES;
  const built = buildAiBranchInput(nodes, rootId, { includeRootNote: kind === "importance", maxNodes });
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
  const targetIds = importanceTargetIds(built.input, nodes);
  return { ...base, ok: true, kind, targetIds, excludedLockedCount: built.input.nodes.length - targetIds.length };
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
