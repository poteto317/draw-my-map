"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { NodeSeparatorField } from "@/components/layout/NodeSeparatorField";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { formatPreviewLabel } from "@/hooks/dialogPreviewText";
import type { NodeSplitMergeError, NodeSplitMergeFocusRequest } from "@/hooks/nodeSplitMergeDialogState";

type NodeSplitDialogProps = {
  targetLabel: string;
  separatorPreset: string;
  customSeparator: string;
  // 分割後の断片。分割できないときは空
  fragments: readonly string[];
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

export function NodeSplitDialog({
  targetLabel,
  separatorPreset,
  customSeparator,
  fragments,
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
}: NodeSplitDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
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
        <h2 id={headingId} className="text-lg font-semibold">ノードを分割</h2>
        <p id={descriptionId} className="text-sm">
          選択中のノードのラベルを区切り文字で分けます。最初の断片は元のノードに残り、残りは元のノードの直後の兄弟ノードとして追加されます。
        </p>
        <p className="text-sm">
          分割するノード:{" "}
          <span className={labelClassName}>{formatPreviewLabel(targetLabel)}</span>
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
        {fragments.length > 0 && (
          <ol aria-label="分割後の断片" className="flex max-h-60 shrink-0 list-decimal flex-col gap-1 overflow-y-auto pl-6 text-sm">
            {fragments.map((fragment, index) => (
              <li key={index} className="rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                <span className={labelClassName}>{formatPreviewLabel(fragment)}</span>
                <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                  {index === 0 ? "元のノードに残る" : "新しい兄弟として追加"}
                </span>
              </li>
            ))}
          </ol>
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
            分割する
          </button>
        </div>
      </div>
    </div>
  );
}
