"use client";

import { useId } from "react";
import type { NoteApplyMode } from "@/domain/aiAssist/aiProposal";
import { AI_PROPOSAL_STALE_MARK, type AiProposalView } from "@/hooks/aiAssistDialogView";

export type AiProposalReviewListProps = {
  proposals: readonly AiProposalView[];
  // 適用時の照合で提案が古いと分かったとき
  disabled: boolean;
  onDecide: (key: string, decision: "accepted" | "rejected") => void;
  onNoteModeChange: (key: string, mode: NoteApplyMode) => void;
};

// 前後の空白を畳まず、長い文も折り返して全文を見せる
const textClassName = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";
const boundedTextClassName = `${textClassName} max-h-40 overflow-y-auto rounded bg-zinc-50 p-2 dark:bg-zinc-900`;

function NoteDiff({
  proposal,
  disabled,
  modeName,
  blockedId,
  placeholderId,
  onNoteModeChange,
}: {
  proposal: Extract<AiProposalView, { kind: "note" }>;
  disabled: boolean;
  modeName: string;
  blockedId: string;
  placeholderId: string;
  onNoteModeChange: (key: string, mode: NoteApplyMode) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="font-medium">現在のメモ</p>
        <p className={boundedTextClassName}>{proposal.currentNote ?? "（メモなし）"}</p>
        <p className="font-medium">適用後のメモ</p>
        {proposal.mode === null ? (
          <p id={placeholderId} className={boundedTextClassName}>（適用方法を選んでください）</p>
        ) : (
          <p className={boundedTextClassName}>{proposal.previewNote}</p>
        )}
      </div>
      {proposal.currentNote !== null && (
        <fieldset disabled={disabled} className="flex flex-col gap-1">
          <legend className="font-medium">適用方法</legend>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name={modeName}
              checked={proposal.mode === "replace"}
              onChange={() => onNoteModeChange(proposal.key, "replace")}
            />
            置き換え
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name={modeName}
              checked={proposal.mode === "append"}
              disabled={!proposal.canAppend}
              aria-describedby={proposal.appendBlockedText === null ? undefined : blockedId}
              onChange={() => onNoteModeChange(proposal.key, "append")}
            />
            末尾に追記
          </label>
          {proposal.appendBlockedText !== null && (
            <p id={blockedId} className="text-amber-700 dark:text-amber-300">{proposal.appendBlockedText}</p>
          )}
        </fieldset>
      )}
      {proposal.error !== null && <p className="text-red-700 dark:text-red-300">{proposal.error}</p>}
    </>
  );
}

// 075 の共通の差分プレビュー。種類ごとの「現在の値 → 提案」の表示だけを差し替える（Phase 33 で種類を足す）。
// <form> にせず、Enter による暗黙の送信を起こさない（L-063）
export function AiProposalReviewList({ proposals, disabled, onDecide, onNoteModeChange }: AiProposalReviewListProps) {
  const idPrefix = useId();
  return (
    <ul aria-label="AIの提案" className="flex max-h-80 shrink-0 flex-col gap-2 overflow-y-auto text-sm">
      {proposals.map((proposal, index) => {
        const decisionName = `${idPrefix}-decision-${index}`;
        // 適用方法が未選択のメモの提案は採用にできない（採否は未決のまま）
        const modeUnselected = proposal.kind === "note" && proposal.mode === null;
        const acceptDisabled = disabled || modeUnselected;
        const placeholderId = `${idPrefix}-placeholder-${index}`;
        return (
          <li key={proposal.key} className="flex flex-col gap-2 rounded border border-zinc-200 p-2 dark:border-zinc-700">
            <p className="font-medium">
              対象: <span className={textClassName}>{proposal.nodeLabel}</span>
            </p>
            {proposal.stale && <p className="text-amber-700 dark:text-amber-300">{AI_PROPOSAL_STALE_MARK}</p>}
            {proposal.kind === "note" ? (
              <NoteDiff
                proposal={proposal}
                disabled={disabled}
                modeName={`${idPrefix}-mode-${index}`}
                blockedId={`${idPrefix}-blocked-${index}`}
                placeholderId={placeholderId}
                onNoteModeChange={onNoteModeChange}
              />
            ) : (
              <p>
                {`${proposal.currentLabel} → ${proposal.proposedLabel}`}
                {proposal.reason !== "" && <span className="ml-2 text-zinc-600 dark:text-zinc-300">{`理由: ${proposal.reason}`}</span>}
              </p>
            )}
            <div role="radiogroup" aria-label={`「${proposal.nodeLabel}」の採否`} className="flex gap-4">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={decisionName}
                  checked={proposal.decision === "accepted"}
                  disabled={acceptDisabled}
                  // 適用方法が未選択のため押せない理由を結び付ける（L-057）。全体が無効のときは別の理由なので結ばない
                  aria-describedby={modeUnselected && !disabled ? placeholderId : undefined}
                  onChange={() => onDecide(proposal.key, "accepted")}
                />
                採用
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={decisionName}
                  checked={proposal.decision === "rejected"}
                  disabled={disabled}
                  onChange={() => onDecide(proposal.key, "rejected")}
                />
                却下
              </label>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
