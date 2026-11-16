"use client";

import { useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { LabelReplaceRow } from "@/domain/search/nodeLabelReplace";
import type { LabelReplaceError, LabelReplaceFocusRequest } from "@/hooks/labelReplaceDialogState";

type LabelReplaceDialogProps = {
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  scopeCount: number;
  previewRows: readonly LabelReplaceRow[];
  hiddenReplaceCount: number;
  previewLimit: number;
  statusText: string;
  submitLabel: string;
  error: LabelReplaceError;
  canSubmit: boolean;
  focusRequest: LabelReplaceFocusRequest;
  onFocusRequestApplied: () => void;
  onQueryChange: (query: string) => void;
  onReplacementChange: (replacement: string) => void;
  onScopeSelectedOnlyChange: (value: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

const inputClassName = "w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900";

function isComposing(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

export function LabelReplaceDialog({
  query,
  replacement,
  scopeSelectedOnly,
  scopeCount,
  previewRows,
  hiddenReplaceCount,
  previewLimit,
  statusText,
  submitLabel,
  error,
  canSubmit,
  focusRequest,
  onFocusRequestApplied,
  onQueryChange,
  onReplacementChange,
  onScopeSelectedOnlyChange,
  onCancel,
  onSubmit,
  onMouseClick,
}: LabelReplaceDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const queryId = useId();
  const replacementId = useId();
  const deleteNoteId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });
  const shownError = useReannouncedNotice(error.sequence, error);

  useLayoutEffect(() => {
    if (focusRequest !== "query") return;
    queryRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

  // 検索語の Enter は置換語へ進むだけ。確定は置換語の欄とボタンに限る（プレビューを見る前の確定を避ける）
  const handleQueryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event)) return;
    event.preventDefault();
    if (!event.repeat) replacementRef.current?.focus();
  };

  const handleReplacementKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event)) return;
    event.preventDefault();
    if (!event.repeat && canSubmit) onSubmit();
  };

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
        <h2 id={headingId} className="text-lg font-semibold">一括置換</h2>
        <p id={descriptionId} className="text-sm">
          ノードのラベルに含まれる文字列をまとめて置き換えます。大文字小文字と全角・半角は区別しません。
        </p>
        <label htmlFor={queryId} className="text-sm">検索語</label>
        <input
          id={queryId}
          ref={queryRef}
          type="text"
          className={inputClassName}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleQueryKeyDown}
        />
        <label htmlFor={replacementId} className="text-sm">置換語</label>
        <input
          id={replacementId}
          ref={replacementRef}
          type="text"
          className={inputClassName}
          value={replacement}
          aria-describedby={replacement === "" ? deleteNoteId : undefined}
          onChange={(event) => onReplacementChange(event.target.value)}
          onKeyDown={handleReplacementKeyDown}
        />
        {replacement === "" && <p id={deleteNoteId} className="text-sm">一致した文字を削除します。</p>}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scopeSelectedOnly}
            disabled={scopeCount === 0}
            onChange={(event) => onScopeSelectedOnlyChange(event.target.checked)}
          />
          選択中のノードだけを対象にする（{scopeCount}件）
        </label>
        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p aria-live="polite" className="text-sm font-medium">{statusText}</p>
        {previewRows.length > 0 && (
          <ul aria-label="置換のプレビュー" className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
            {previewRows.map((row) => (
              <li key={row.nodeId} className="flex flex-col gap-0.5 rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                <span className="flex min-w-0 items-start gap-2">
                  <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{row.before}</span>
                  <span aria-hidden="true" className="shrink-0">→</span>
                  <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{row.after === "" ? "（空）" : row.after}</span>
                </span>
                {row.status === "emptied" && (
                  <span className="text-amber-700 dark:text-amber-300">置換後のラベルが空になるため置換しません。</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {hiddenReplaceCount > 0 && (
          <p className="text-sm">
            {`ほかに${hiddenReplaceCount}件（一覧は先頭の${previewLimit}件まで表示します。確定はすべてが対象です）`}
          </p>
        )}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{shownError?.message ?? ""}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded border px-3 py-2 text-sm"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
