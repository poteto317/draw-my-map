"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { AiProposalReviewList } from "@/components/layout/AiProposalReviewList";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { AI_LABEL_EXCERPT_MAX_LENGTH, AI_NOTE_EXCERPT_MAX_LENGTH } from "@/domain/aiAssist/aiBranchInput";
import type { AiAssistKind } from "@/domain/aiAssist/aiAssistEntryAvailability";
import type { NoteApplyMode } from "@/domain/aiAssist/aiProposal";
import {
  AI_PROPOSALS_STALE_MESSAGE,
  type AiAssistConfirmView,
  type AiAssistDialogView,
} from "@/hooks/aiAssistDialogView";

export type AiAssistDialogProps = {
  view: AiAssistDialogView;
  onClose: () => void;
  onSend: () => void;
  onRetry: () => void;
  onDecide: (key: string, decision: "accepted" | "rejected") => void;
  onNoteModeChange: (key: string, mode: NoteApplyMode) => void;
  onApply: () => void;
  onMouseClick: () => void;
};

// key に使う安定した種類（ラベルは件数などで変わるため key にしない）
type ActionId = "close" | "cancel" | "send" | "retry" | "regenerate" | "apply";

type ActionButton = { id: ActionId; label: string; onClick: () => void; primary?: boolean; disabled?: boolean; describedBy?: string };

const secondaryButtonClassName = "rounded border px-3 py-2 text-sm";
const primaryButtonClassName = "rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40";
const wrapTextClassName = "whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

function sentDescription(kind: AiAssistKind, confirm: AiAssistConfirmView): string {
  const truncated = confirm.truncatedCount > 0 ? `。${confirm.truncatedCount} 件は先頭だけ` : "";
  const limits = `ラベルは各 ${AI_LABEL_EXCERPT_MAX_LENGTH} 文字、メモは各 ${AI_NOTE_EXCERPT_MAX_LENGTH} 文字まで${truncated}`;
  const ownNote = kind === "branch-summary" ? "。選んだノード自身のメモは送りません" : "";
  return `選んだノード「${confirm.rootLabel}」と子孫 ${confirm.descendantCount} 件のラベルとメモ（${limits}）、合計 ${confirm.totalLength.toLocaleString("ja-JP")} 文字${ownNote}`;
}

// 開いた後にマップが更新されたときは、view.statusText（aria-live="polite"）がすでに STALE_DIALOG_MESSAGE なので、
// alert に重ねて二度読み上げない。古いダイアログでは画面ごとの誤りも出さない
function alertText(view: AiAssistDialogView): string {
  if (view.stale) return "";
  if (view.body.screen === "failed") return view.body.message;
  if (view.body.screen === "review") return view.body.proposalsStale ? AI_PROPOSALS_STALE_MESSAGE : view.body.applyError ?? "";
  return "";
}

function actionsOf(view: AiAssistDialogView, props: AiAssistDialogProps, blockedId: string): ActionButton[] {
  const close: ActionButton = { id: "close", label: "閉じる", onClick: props.onClose };
  if (view.stale) return [close];
  const { body } = view;
  switch (body.screen) {
    case "checking":
      return [{ id: "cancel", label: "キャンセル", onClick: props.onClose }];
    case "unavailable":
      return [close];
    case "confirm":
      return [
        { id: "cancel", label: "キャンセル", onClick: props.onClose },
        {
          id: "send", label: "送信して提案を作る", onClick: props.onSend, primary: true,
          disabled: body.confirm.blockedReason !== null,
          describedBy: body.confirm.blockedReason === null ? undefined : blockedId,
        },
      ];
    case "generating":
      return [{ id: "cancel", label: "取り消し", onClick: props.onClose }];
    case "failed":
      return [close, { id: "retry", label: "もう一度", onClick: props.onRetry, primary: true }];
    case "review":
      if (body.proposals.length === 0) return [close];
      if (body.proposalsStale) return [close, { id: "regenerate", label: "もう一度提案を作る", onClick: props.onRetry, primary: true }];
      return [close, { id: "apply", label: `採用した ${body.acceptedCount} 件を適用`, onClick: props.onApply, primary: true, disabled: !body.canApply }];
  }
}

// 送れないとき（blockedReason あり）は view の件数・根ラベルが事実を表さないため、「送るもの」「対象外」を出さない
function ConfirmBody({ kind, confirm, blockedId }: { kind: AiAssistKind; confirm: AiAssistConfirmView; blockedId: string }) {
  const sendable = confirm.blockedReason === null;
  return (
    <>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="font-medium">送信先</dt>
          <dd className={wrapTextClassName}>{`${confirm.providerLabel}（${confirm.model}）`}</dd>
        </div>
        {sendable && (
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium">送るもの</dt>
            <dd className={wrapTextClassName}>{sentDescription(kind, confirm)}</dd>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <dt className="font-medium">送らないもの</dt>
          <dd>イラスト・URL・タグ・出典・他のマップ</dd>
        </div>
        {sendable && confirm.excludedLockedCount !== null && (
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium">対象外</dt>
            <dd>{`ロック中のノード ${confirm.excludedLockedCount} 件（内容は文脈として送り、提案の対象にしません）`}</dd>
          </div>
        )}
      </dl>
      {confirm.blockedReason !== null && (
        <p id={blockedId} className="text-sm text-amber-700 dark:text-amber-300">{confirm.blockedReason}</p>
      )}
    </>
  );
}

// AI 支援のダイアログ。中身は <form> にせず、送信・適用・もう一度は type="button" のクリックだけで動く（L-063）
export function AiAssistDialog(props: AiAssistDialogProps) {
  const { view, onClose, onDecide, onNoteModeChange, onMouseClick } = props;
  const headingId = useId();
  const descriptionId = useId();
  const blockedId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onClose });

  // 開いたとき・画面が変わったときは見出しへフォーカスする。取り消しにフォーカスがあるまま一覧に替わっても、
  // 続けて押した Enter が適用に届かない（L-408）
  const proposalsStale = view.body.screen === "review" && view.body.proposalsStale;
  const screenKey = `${view.body.screen}:${view.stale}:${proposalsStale}`;
  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, [screenKey]);

  const { body } = view;
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold">{view.title}</h2>
        <p id={descriptionId} className="text-sm">
          AI の提案を確かめて、変更ごとに採用・却下を選んでから適用します。マップは自動では変わりません。
        </p>
        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p aria-live="polite" className="text-sm font-medium">{view.statusText}</p>
        {!view.stale && body.screen === "unavailable" && <p className="text-sm">{body.message}</p>}
        {!view.stale && body.screen === "confirm" && <ConfirmBody kind={view.kind} confirm={body.confirm} blockedId={blockedId} />}
        {!view.stale && body.screen === "review" && body.proposals.length > 0 && (
          <AiProposalReviewList
            proposals={body.proposals}
            disabled={body.proposalsStale}
            onDecide={onDecide}
            onNoteModeChange={onNoteModeChange}
          />
        )}
        {!view.stale && body.screen === "review" && body.unchangedCount > 0 && body.proposals.length > 0 && (
          <p className="text-sm">{`変更なし ${body.unchangedCount} 件`}</p>
        )}
        {!view.stale && body.screen === "review" && body.missingCount > 0 && (
          <p className="text-sm">{`提案なし ${body.missingCount} 件`}</p>
        )}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{alertText(view)}</p>
        <div className="flex justify-end gap-2">
          {actionsOf(view, props, blockedId).map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled ?? false}
              aria-describedby={action.describedBy}
              onClick={action.onClick}
              onKeyDown={preventRepeatedActivationClick}
              className={action.primary ? primaryButtonClassName : secondaryButtonClassName}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
