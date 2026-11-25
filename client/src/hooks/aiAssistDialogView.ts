import {
  AI_ASSIST_ENTRY_MESSAGES,
  type AiAssistEntryBlockers,
  type AiAssistKind,
} from "@/domain/aiAssist/aiAssistEntryAvailability";
import {
  planNoteFromSummary,
  type AiProposalDecision,
  type NoteApplyMode,
} from "@/domain/aiAssist/aiProposal";
import { NODE_NOTE_MAX_LENGTH, NODE_NOTE_MERGE_JOINER, formatNodeNoteLength } from "@/domain/nodes/nodeNote";
import { acceptedAiProposals, type AiAssistDialogState, type AiAssistReview } from "@/hooks/aiAssistDialogState";
import { planAiAssistSend } from "@/hooks/aiAssistSendPlan";
import { STALE_DIALOG_MESSAGE, formatPreviewLabel } from "@/hooks/dialogPreviewText";
import { describeAiAssistError } from "@/services/aiAssist/aiAssistClient";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export const AI_ASSIST_DIALOG_TITLES: Readonly<Record<AiAssistKind, string>> = {
  "branch-summary": "枝を要約してメモに入れる",
  importance: "重要度を提案",
};

export const AI_ASSIST_UNAVAILABLE_MESSAGE =
  "AI 支援が設定されていません。ANTHROPIC_API_KEY または OPENAI_API_KEY を設定し、提供元の指定（AI_ASSIST_PROVIDER）も確認してください（手順: docs/setup/ai-assist-setup.md）";
export const AI_PROPOSALS_STALE_MESSAGE =
  "提案を作った後にマップが変わったため、適用しませんでした。もう一度提案を作ってください。";
export const AI_PROPOSAL_STALE_MARK = "提案を作った後に変わりました";
export const AI_NOTE_TOO_LONG_APPLY_MESSAGE =
  "追記するとメモの上限を超えるため、適用できませんでした。「置き換え」を選んでください。";
export const AI_APPLY_FAILED_MESSAGE = "適用できませんでした。";

// 確定の時点で保護モード・競合・外部削除なら、入口と同じ文言・同じ優先順の理由を添える。止めないなら null
export function aiApplyBlockedMessage(blockers: AiAssistEntryBlockers): string | null {
  const reason = blockers.isExternallyDeleted ? AI_ASSIST_ENTRY_MESSAGES.externallyDeleted
    : blockers.hasConflict ? AI_ASSIST_ENTRY_MESSAGES.conflict
      : blockers.isProtectedMode ? AI_ASSIST_ENTRY_MESSAGES.protected
        : null;
  return reason === null ? null : `適用できませんでした（${reason}）。`;
}

const IMPORTANCE_LABELS: Readonly<Record<NodeImportance, string>> = { high: "高", medium: "中", low: "低" };

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

export function buildAiProposalViews(nodes: readonly Node[], review: AiAssistReview): AiProposalView[] {
  return review.proposals.map((proposal): AiProposalView => {
    const decision = review.decisions[proposal.key] ?? "undecided";
    const stale = review.staleKeys.includes(proposal.key);
    if (proposal.kind === "importance") {
      return {
        kind: "importance", key: proposal.key, nodeLabel: formatPreviewLabel(proposal.baseline.label), decision, stale,
        currentLabel: IMPORTANCE_LABELS[proposal.baseline.importance],
        proposedLabel: IMPORTANCE_LABELS[proposal.proposed],
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
      const acceptedCount = acceptedAiProposals(state.review).length;
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
