import { describeMergeTaskAttributes } from "@/domain/nodes/nodeTaskAttributeMergePreview";
import type { AiAssistEntryBlockers, AiAssistKind } from "@/domain/aiAssist/aiAssistEntryAvailability";
import {
  planNoteFromSummary,
  type AiProposalDecision,
  type NoteApplyMode,
} from "@/domain/aiAssist/aiProposal";
import { NODE_IMPORTANCE_LABELS } from "@/domain/nodes/nodeImportance";
import { NODE_NOTE_MAX_LENGTH, NODE_NOTE_MERGE_JOINER, formatNodeNoteLength } from "@/domain/nodes/nodeNote";
import {
  acceptedAiReviewCount,
  type AiAssistDialogState,
  type AiAssistReview,
} from "@/hooks/aiAssistDialogState";
import {
  AI_MERGE_ATTRIBUTES_HINT,
  describeStructureProposal,
  type StructureAiProposal,
} from "@/domain/aiAssist/aiStructureProposal";
import { AI_NOTE_TOO_LONG_APPLY_MESSAGE } from "@/hooks/aiAssistDialogApply";
import { planAiAssistSend } from "@/hooks/aiAssistSendPlan";
import { STALE_DIALOG_MESSAGE, formatPreviewLabel } from "@/hooks/dialogPreviewText";
import { describeAiAssistError } from "@/services/aiAssist/aiAssistClient";
import type { Node } from "@/types/node";

export const AI_ASSIST_DIALOG_TITLES: Readonly<Record<AiAssistKind, string>> = {
  "branch-summary": "枝を要約してメモに入れる",
  importance: "重要度を提案",
  "child-candidates": "子の候補を提案",
  "classify-reorder": "分類・並べ替えを提案",
  duplicates: "重複・類似を検出",
  "missing-perspectives": "不足観点を提案",
};

// 文言の正本は aiAssistClient の not-configured（ダイアログの unavailable 画面と通信エラーで同じ文を出す）
export const AI_ASSIST_UNAVAILABLE_MESSAGE = describeAiAssistError("not-configured");
export const AI_PROPOSALS_STALE_MESSAGE =
  "提案を作った後にマップが変わったため、適用しませんでした。もう一度提案を作ってください。";
export const AI_PROPOSAL_STALE_MARK = "提案を作った後に変わりました";
export type AiAssistConfirmView = {
  providerLabel: string;
  model: string;
  rootLabel: string;
  descendantCount: number;
  totalLength: number;
  truncatedCount: number;
  // 重要度だけ。ロック中で対象外の件数
  excludedLockedCount: number | null;
  blockedReason: string | null;
};

export type AiProposalView =
  | {
    kind: "note"; key: string; nodeLabel: string; decision: AiProposalDecision; stale: boolean;
    currentNote: string | null; mode: NoteApplyMode | null; canAppend: boolean; appendBlockedText: string | null;
    previewNote: string; error: string | null;
  }
  | {
    kind: "importance"; key: string; nodeLabel: string; decision: AiProposalDecision; stale: boolean;
    currentLabel: string; proposedLabel: string; reason: string;
  }
  | {
    kind: "structure"; key: string; nodeLabel: string; decision: AiProposalDecision; stale: boolean;
    summary: string; mergeHint: string | null;
  };

export type AiAssistDialogBody =
  | { screen: "checking" }
  | { screen: "unavailable"; message: string }
  | { screen: "confirm"; confirm: AiAssistConfirmView }
  | { screen: "generating" }
  | { screen: "failed"; message: string }
  | {
    screen: "review"; proposals: AiProposalView[]; unchangedCount: number; missingCount: number;
    acceptedCount: number; canApply: boolean; proposalsStale: boolean; applyError: string | null;
  };

export type AiAssistDialogView = {
  kind: AiAssistKind;
  title: string;
  // 開いた後にマップ ID か documentRevision が変わった（閉じるだけ押せる）
  stale: boolean;
  // aria-live="polite" の状態文
  statusText: string;
  body: AiAssistDialogBody;
};

function labelOf(nodes: readonly Node[], nodeId: number): string {
  const node = nodes.find((item) => item.id === nodeId);
  return formatPreviewLabel(node?.label ?? "");
}

function structureProposalLabel(nodes: readonly Node[], proposal: StructureAiProposal): string {
  switch (proposal.kind) {
    case "add-child":
      return formatPreviewLabel(nodes.find((node) => node.id === proposal.parentId)?.label ?? "");
    case "add-sibling":
      return formatPreviewLabel(nodes.find((node) => node.id === proposal.anchorId)?.label ?? "");
    case "reparent":
      return formatPreviewLabel(proposal.baseline.label);
    case "reorder-siblings":
      return formatPreviewLabel(nodes.find((node) => node.id === proposal.parentId)?.label ?? "");
    case "merge-pair":
      return formatPreviewLabel(proposal.baseline.primaryLabel);
    default: {
      const neverKind: never = proposal;
      return neverKind;
    }
  }
}

export function buildAiProposalViews(nodes: readonly Node[], review: AiAssistReview): AiProposalView[] {
  const labelById = new Map(nodes.map(({ id, label }) => [id, label]));
  return review.proposals.map((proposal): AiProposalView => {
    const decision = review.decisions[proposal.key] ?? "undecided";
    const stale = review.staleKeys.includes(proposal.key);
    if (
      proposal.kind === "add-child"
      || proposal.kind === "add-sibling"
      || proposal.kind === "reparent"
      || proposal.kind === "reorder-siblings"
      || proposal.kind === "merge-pair"
    ) {
      let mergeHint = null;
      if (proposal.kind === "merge-pair") {
        const details = proposal.expectedPlan.ok ? describeMergeTaskAttributes(proposal.expectedPlan, labelById) : {};
        mergeHint = [AI_MERGE_ATTRIBUTES_HINT, details.taskText, details.customAttributeText]
          .filter(Boolean)
          .join(" ");
      }
      return {
        kind: "structure",
        key: proposal.key,
        nodeLabel: structureProposalLabel(nodes, proposal),
        decision,
        stale,
        summary: describeStructureProposal(nodes, proposal),
        mergeHint,
      };
    }
    if (proposal.kind === "importance") {
      return {
        kind: "importance", key: proposal.key, nodeLabel: formatPreviewLabel(proposal.baseline.label), decision, stale,
        currentLabel: NODE_IMPORTANCE_LABELS[proposal.baseline.importance],
        proposedLabel: NODE_IMPORTANCE_LABELS[proposal.proposed],
        reason: proposal.reason,
      };
    }
    const current = proposal.baseline.note;
    const mode = review.noteModes[proposal.key] ?? null;
    const append = planNoteFromSummary(current, proposal.summary, "append");
    const canAppend = current !== undefined && append.ok;
    const appendLength = (current?.length ?? 0) + NODE_NOTE_MERGE_JOINER.length + proposal.summary.length;
    return {
      kind: "note", key: proposal.key, nodeLabel: labelOf(nodes, proposal.nodeId), decision, stale,
      currentNote: current ?? null,
      mode,
      canAppend,
      appendBlockedText: current !== undefined && !append.ok
        ? `追記すると ${formatNodeNoteLength(NODE_NOTE_MAX_LENGTH)} 文字を超えます（${formatNodeNoteLength(appendLength)} 文字）`
        : null,
      previewNote: mode === "append" && append.ok ? append.note : proposal.summary,
      error: review.noteTooLongKeys.includes(proposal.key) ? AI_NOTE_TOO_LONG_APPLY_MESSAGE : null,
    };
  });
}

function reviewStatusText(kind: AiAssistKind, review: AiAssistReview): string {
  if (review.staleKeys.length > 0) return "提案は古くなりました。";
  if (review.proposals.length > 0) return `提案が ${review.proposals.length} 件あります`;
  if (kind !== "importance") return "提案はありませんでした。";
  return review.missingCount > 0
    ? `提案はありませんでした（現在と同じ ${review.unchangedCount} 件、提案なし ${review.missingCount} 件）`
    : `提案はすべて現在の重要度と同じでした（${review.unchangedCount} 件）`;
}

function buildBody(
  state: Exclude<AiAssistDialogState, { screen: "closed" }>,
  stale: boolean,
  nodes: readonly Node[],
  blockers: AiAssistEntryBlockers,
): { body: AiAssistDialogBody; statusText: string } {
  switch (state.screen) {
    case "checking":
      return { body: { screen: "checking" }, statusText: "確認しています…" };
    case "unavailable":
      return { body: { screen: "unavailable", message: AI_ASSIST_UNAVAILABLE_MESSAGE }, statusText: "AI 支援は使えません。" };
    case "confirm": {
      const plan = planAiAssistSend(state.target.kind, nodes, state.target.rootId, blockers);
      const confirm: AiAssistConfirmView = plan.ok
        ? {
          providerLabel: state.status.providerLabel, model: state.status.model,
          rootLabel: formatPreviewLabel(plan.rootLabel), descendantCount: plan.descendantCount,
          totalLength: plan.totalLength, truncatedCount: plan.truncatedCount,
          excludedLockedCount: plan.kind === "importance" ? plan.excludedLockedCount : null,
          blockedReason: null,
        }
        : {
          providerLabel: state.status.providerLabel, model: state.status.model,
          rootLabel: formatPreviewLabel(plan.rootLabel ?? ""), descendantCount: 0, totalLength: 0, truncatedCount: 0,
          excludedLockedCount: null, blockedReason: plan.reason,
        };
      return {
        body: { screen: "confirm", confirm },
        statusText: confirm.blockedReason === null ? "送信する内容を確認してください。" : "送信できません。",
      };
    }
    case "generating":
      return { body: { screen: "generating" }, statusText: "提案を作っています…" };
    case "failed":
      return { body: { screen: "failed", message: describeAiAssistError(state.errorKind) }, statusText: "提案を作れませんでした。" };
    case "review": {
      const proposalsStale = state.review.staleKeys.length > 0;
      const acceptedCount = acceptedAiReviewCount(state.review);
      return {
        body: {
          screen: "review",
          proposals: buildAiProposalViews(nodes, state.review),
          unchangedCount: state.review.unchangedCount,
          missingCount: state.review.missingCount,
          acceptedCount,
          canApply: !stale && !proposalsStale && acceptedCount > 0,
          proposalsStale,
          applyError: state.review.applyError,
        },
        statusText: reviewStatusText(state.target.kind, state.review),
      };
    }
  }
}

export function buildAiAssistDialogView(
  state: AiAssistDialogState,
  stale: boolean,
  nodes: readonly Node[],
  blockers: AiAssistEntryBlockers,
): AiAssistDialogView | null {
  if (state.screen === "closed") return null;
  const { body, statusText } = buildBody(state, stale, nodes, blockers);
  return {
    kind: state.target.kind,
    title: AI_ASSIST_DIALOG_TITLES[state.target.kind],
    stale,
    statusText: stale ? STALE_DIALOG_MESSAGE : statusText,
    body,
  };
}
