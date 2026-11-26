"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { NodeSeparatorField } from "@/components/layout/NodeSeparatorField";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { formatPreviewLabel } from "@/hooks/dialogPreviewText";
import type { NodeSplitMergeError, NodeSplitMergeFocusRequest } from "@/hooks/nodeSplitMergeDialogState";
import { NODE_MERGE_PREVIEW_LIMIT, type NodeMergePreview } from "@/hooks/nodeMergePreview";

type NodeMergeDialogProps = {
  // 統合できないとき（計画の失敗）は null
  preview: NodeMergePreview | null;
  separatorPreset: string;
  customSeparator: string;
  statusText: string;
  error: NodeSplitMergeError;
  canSubmit: boolean;
  focusRequest: NodeSplitMergeFocusRequest;
  onFocusRequestApplied: () => void;
  onSeparatorPresetChange: (presetId: string) => void;
  onCustomSeparatorChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

// 前後の空白を畳まず、長いラベルも折り返して全文を見せる（L-821）
const labelClassName = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";
// 1 つで長くなりうる値（残すノード・統合後のラベル・イラスト）は、高さに上限を付けて確定ボタンから遠ざけない
const boundedLabelClassName = `${labelClassName} max-h-40 overflow-y-auto`;

export function NodeMergeDialog({
  preview,
  separatorPreset,
  customSeparator,
  statusText,
  error,
  canSubmit,
  focusRequest,
  onFocusRequestApplied,
  onSeparatorPresetChange,
  onCustomSeparatorChange,
  onCancel,
  onSubmit,
  onMouseClick,
}: NodeMergeDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const absorbedHeadingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });
  const shownError = useReannouncedNotice(error.sequence, error);

  useLayoutEffect(() => {
    if (focusRequest !== "separator") return;
    selectRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

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
        <h2 id={headingId} className="text-lg font-semibold">ノードを統合</h2>
        <p id={descriptionId} className="text-sm">
          選択中の同じ親の兄弟ノードを、残すノード（最後に選んだノード＝主選択）へ 1 つにまとめます。ほかのノードは消え、その子は残すノードの子の末尾へ付け替えられます。
        </p>
        <NodeSeparatorField
          preset={separatorPreset}
          customSeparator={customSeparator}
          selectRef={selectRef}
          onPresetChange={onSeparatorPresetChange}
          onCustomSeparatorChange={onCustomSeparatorChange}
          onCustomEnter={() => {
            if (canSubmit) onSubmit();
          }}
        />
        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p aria-live="polite" className="text-sm font-medium">{statusText}</p>
        {preview !== null && (
          <>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">残すノード</dt>
                <dd className={boundedLabelClassName}>{formatPreviewLabel(preview.survivorLabel)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="shrink-0 font-medium">統合後のラベル</dt>
                <dd className={boundedLabelClassName}>{formatPreviewLabel(preview.label)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">重要度</dt>
                <dd>{preview.importanceLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">イラスト</dt>
                <dd className={boundedLabelClassName}>{preview.illustrationText}</dd>
              </div>
              {preview.noteText !== null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">メモ</dt>
                  <dd className={boundedLabelClassName}>{preview.noteText}</dd>
                </div>
              )}
              {preview.linkText !== null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">URL</dt>
                  <dd>{preview.linkText}</dd>
                </div>
              )}
              {preview.tagText !== null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">タグ</dt>
                  <dd>{preview.tagText}</dd>
                </div>
              )}
              {preview.sourceText !== null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">出典</dt>
                  <dd>{preview.sourceText}</dd>
                </div>
              )}
              {preview.taskText && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">タスク</dt>
                  <dd>{preview.taskText}</dd>
                </div>
              )}
              {preview.customAttributeText && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">カスタム属性</dt>
                  <dd>{preview.customAttributeText}</dd>
                </div>
              )}
              {preview.mapLinkText !== null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">マップ間リンク</dt>
                  <dd>{preview.mapLinkText}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">付け替える子</dt>
                <dd>{`${preview.movedChildCount}件`}</dd>
              </div>
            </dl>
            {preview.discardedIllustrationCount > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {`${preview.discardedIllustrationCount}件のイラストは統合で失われます`}
              </p>
            )}
            <p id={absorbedHeadingId} className="text-sm font-medium">統合されて消えるノード</p>
            <ul aria-labelledby={absorbedHeadingId} className="flex max-h-60 shrink-0 flex-col gap-1 overflow-y-auto text-sm">
              {preview.absorbedLabels.map((label, index) => (
                <li key={index} className="rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                  <span className={labelClassName}>{formatPreviewLabel(label)}</span>
                </li>
              ))}
            </ul>
            {preview.hiddenAbsorbedCount > 0 && (
              <p className="text-sm">{`ほかに${preview.hiddenAbsorbedCount}件（一覧は先頭の${NODE_MERGE_PREVIEW_LIMIT}件まで表示します。確定はすべてが対象です）`}</p>
            )}
          </>
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
            統合する
          </button>
        </div>
      </div>
    </div>
  );
}
