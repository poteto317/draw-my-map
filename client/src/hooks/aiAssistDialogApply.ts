import {
  AI_ASSIST_ENTRY_MESSAGES,
  type AiAssistEntryBlockers,
} from "@/domain/aiAssist/aiAssistEntryAvailability";
import type { AiProposalsApplyOutcome } from "@/domain/aiAssist/aiProposal";
import type { AiStructureApplyOutcome } from "@/domain/aiAssist/aiStructureProposal";

export const AI_APPLY_FAILED_MESSAGE = "適用できませんでした。";
export const AI_NOTE_TOO_LONG_APPLY_MESSAGE =
  "追記するとメモの上限を超えるため、適用できませんでした。「置き換え」を選んでください。";

// 確定の時点で保護モード・競合・外部削除なら、入口と同じ文言・同じ優先順の理由を添える。止めないなら null
export function aiApplyBlockedMessage(blockers: AiAssistEntryBlockers): string | null {
  const reason = blockers.isExternallyDeleted ? AI_ASSIST_ENTRY_MESSAGES.externallyDeleted
    : blockers.hasConflict ? AI_ASSIST_ENTRY_MESSAGES.conflict
      : blockers.isProtectedMode ? AI_ASSIST_ENTRY_MESSAGES.protected
        : null;
  return reason === null ? null : `適用できませんでした（${reason}）。`;
}

export type AiAssistApplyFollowUp =
  | { kind: "success"; appliedCount: number }
  | { kind: "stale"; staleKeys: string[] }
  | { kind: "note-too-long"; noteKeys: string[] }
  | { kind: "failed"; message: string };

export function planAiAssistApplyFollowUp(
  outcome: AiProposalsApplyOutcome | AiStructureApplyOutcome,
  noteTooLongKeys?: readonly string[],
): AiAssistApplyFollowUp {
  if (outcome.ok) return { kind: "success", appliedCount: outcome.appliedCount };
  if (outcome.reason === "stale") return { kind: "stale", staleKeys: [...outcome.staleKeys] };
  if (outcome.reason === "note-too-long") {
    return { kind: "note-too-long", noteKeys: noteTooLongKeys === undefined ? [] : [...noteTooLongKeys] };
  }
  return { kind: "failed", message: AI_APPLY_FAILED_MESSAGE };
}

export const aiAssistApplySuccessMessage = (appliedCount: number): string =>
  `AIの提案を ${appliedCount} 件適用しました。元に戻すで取り消せます。`;

export const aiAssistNoteTooLongApplyMessage = AI_NOTE_TOO_LONG_APPLY_MESSAGE;