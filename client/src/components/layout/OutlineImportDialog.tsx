"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { OutlineImportInputScreen } from "@/components/layout/OutlineImportInputScreen";
import {
  OutlineImportPreviewScreen,
  type OutlineParentCandidate,
} from "@/components/layout/OutlineImportPreviewScreen";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { ParsedOutline } from "@/domain/outline/outlineParser";
import type { OutlinePreview } from "@/domain/outline/outlinePreview";
import type {
  OutlineDialogNotices,
  OutlineImportFocusRequest,
  OutlineImportTarget,
  OutlineInputError,
} from "@/hooks/useOutlineImport";

type OutlineImportDialogProps = {
  screen: "input" | "preview";
  text: string;
  textLength: number;
  inputError: OutlineInputError;
  outline: ParsedOutline | null; // preview のときだけ値を持つ
  preview: OutlinePreview | null;
  parentCandidate: OutlineParentCandidate;
  target: OutlineImportTarget;
  dialogNotices: OutlineDialogNotices;
  focusRequest: OutlineImportFocusRequest | null;
  onFocusRequestApplied: () => void;
  onTextChange: (text: string) => void;
  onPreview: () => void;
  onCancel: () => void; // 入力の画面の「キャンセル」と Escape
  onBack: () => void; // プレビューの画面の「戻る」と Escape
  onTargetChange: (target: OutlineImportTarget) => void;
  onSubmit: () => void;
  // ダイアログの中のマウスのクリック（detail > 0）ごとに呼ぶ。閉じた直後のダブルクリックの続きを
  // キャンバスが無視するために、呼び出し側がクリックの時刻を控える
  onMouseClick: () => void;
};

// 画面の状態とテキストは持たず、MapEditor から受け取って表示するだけにする
export function OutlineImportDialog({
  screen,
  text,
  textLength,
  inputError,
  outline,
  preview,
  parentCandidate,
  target,
  dialogNotices,
  focusRequest,
  onFocusRequestApplied,
  onTextChange,
  onPreview,
  onCancel,
  onBack,
  onTargetChange,
  onSubmit,
  onMouseClick,
}: OutlineImportDialogProps) {
  const headingId = useId();
  const summaryId = useId();
  const warningsId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const onFocusRequestAppliedRef = useRef(onFocusRequestApplied);

  // 背景のクリックでは閉じない（L-158）。Escape は画面ごとに一つ前へ戻る（L-159）
  useDialogFocusTrap({
    dialogRef,
    overlayRef,
    onEscape: screen === "preview" ? onBack : onCancel,
  });
  const shownNotices = useReannouncedNotice(dialogNotices.sequence, dialogNotices);

  useLayoutEffect(() => {
    onFocusRequestAppliedRef.current = onFocusRequestApplied;
  }, [onFocusRequestApplied]);

  // 呼び出し側の誤りでプレビューの値が無くても落ちないよう、画面の中身を描画しない
  const previewContent =
    screen === "preview" && outline !== null && preview !== null
      ? { outline, preview }
      : null;
  const hasContent = screen === "input" || previewContent !== null;

  // 画面が描画された後に当てる。autoFocus は使わない（L-584）。"header" は MapEditor が扱う
  // MapLibraryDialog と違い、対象の要素が無いときは別の要素へ当てず、要求を残して描画された後に当て直す
  useLayoutEffect(() => {
    if (!hasContent) return;
    switch (focusRequest) {
      case null:
      case "header":
        return;
      case "input": {
        const textarea = textareaRef.current;
        if (textarea === null) return;
        textarea.focus();
        // 続けて書き足せるよう、全選択せずカーソルを末尾に置く
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
        break;
      }
      case "preview": {
        const region = regionRef.current;
        if (region === null) return;
        region.focus();
        break;
      }
      default: {
        const unreachable: never = focusRequest;
        throw new Error(`Unknown outline import focus request: ${JSON.stringify(unreachable)}`);
      }
    }
    onFocusRequestAppliedRef.current();
  }, [focusRequest, screen, hasContent]);

  const renderScreen = () => {
    if (screen === "input") {
      return (
        <OutlineImportInputScreen
          headingId={headingId}
          text={text}
          textLength={textLength}
          inputError={inputError}
          onTextChange={onTextChange}
          onPreview={onPreview}
          onCancel={onCancel}
          textareaRef={textareaRef}
        />
      );
    }
    if (previewContent === null) return null;
    return (
      <OutlineImportPreviewScreen
        headingId={headingId}
        summaryId={summaryId}
        warningsId={warningsId}
        outline={previewContent.outline}
        preview={previewContent.preview}
        parentCandidate={parentCandidate}
        target={target}
        onTargetChange={onTargetChange}
        onSubmit={onSubmit}
        onBack={onBack}
        regionRef={regionRef}
      />
    );
  };
  const screenContent = renderScreen();

  return (
    <div
      ref={overlayRef}
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        // 余白を押したときにフォーカスを body へ落とさず、ダイアログ自身に受け止める。Tab の巡回には入れない
        tabIndex={-1}
        aria-modal="true"
        // 画面ごとの名前と説明は、下の group に持たせる。ダイアログ自身は画面によらない名前にする
        aria-label="箇条書きから追加"
        // 深い階層の横スクロールは、プレビューの領域（overflow-auto）の内側で起きる
        className="flex max-h-full w-full max-w-[36rem] flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        {screenContent !== null && (
          // ダイアログの要素は画面が変わっても同じなので、画面ごとに新しい group を作り、
          // フォーカスが入ったときに見出しと説明（プレビューでは要約と警告）を読ませる（L-601）
          <div
            key={screen}
            role="group"
            aria-labelledby={headingId}
            aria-describedby={screen === "preview" ? `${summaryId} ${warningsId}` : undefined}
          >
            {screenContent}
          </div>
        )}
        {/* 最初から常設し、文言だけを差し替える（L-153・L-166） */}
        <div className="text-sm">
          <p role="status" aria-live="polite" className="text-zinc-600 dark:text-zinc-400">
            {shownNotices?.status ?? ""}
          </p>
          <p
            role="alert"
            aria-live="assertive"
            className="break-words text-red-700 [overflow-wrap:anywhere] dark:text-red-300"
          >
            {shownNotices?.alert ?? ""}
          </p>
        </div>
      </div>
    </div>
  );
}
