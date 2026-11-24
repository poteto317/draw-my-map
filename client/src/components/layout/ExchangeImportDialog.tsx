"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { ExchangeImportInputScreen } from "@/components/layout/ExchangeImportInputScreen";
import { ExchangeImportPreviewScreen } from "@/components/layout/ExchangeImportPreviewScreen";
import type { OutlineParentCandidate } from "@/components/layout/OutlineImportPreviewScreen";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { ExchangeFormatEntry } from "@/domain/exchange/parseExchangeContent";
import type { OutlinePreview } from "@/domain/outline/outlinePreview";
import type {
  ExchangeDialogNotices,
  ExchangeImportFocusRequest,
  ExchangeInputError,
} from "@/hooks/useExchangeImport";
import type { OutlineImportTarget } from "@/domain/nodes/resolveForestImportInsertionTarget";
import type { ParsedExchange } from "@/domain/exchange/parseExchangeContent";

type ExchangeImportDialogProps = {
  screen: "input" | "preview";
  entry: ExchangeFormatEntry;
  fileName: string | null;
  delimiter: "," | "\t";
  inputError: ExchangeInputError;
  parsed: ParsedExchange | null;
  preview: OutlinePreview | null;
  parentCandidate: OutlineParentCandidate;
  target: OutlineImportTarget;
  dialogNotices: ExchangeDialogNotices;
  focusRequest: ExchangeImportFocusRequest | null;
  onFocusRequestApplied: () => void;
  onFileLoad: (fileName: string, text: string) => void;
  onLoadError: (message: string) => void;
  onDelimiterChange: (delimiter: "," | "\t") => void;
  onPreview: () => void;
  onCancel: () => void;
  onBack: () => void;
  onTargetChange: (target: OutlineImportTarget) => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

const DIALOG_LABEL: Record<ExchangeFormatEntry, string> = {
  opml: "OPML取り込み",
  "csv-tsv": "CSV/TSV取り込み",
};

export function ExchangeImportDialog({
  screen,
  entry,
  fileName,
  delimiter,
  inputError,
  parsed,
  preview,
  parentCandidate,
  target,
  dialogNotices,
  focusRequest,
  onFocusRequestApplied,
  onFileLoad,
  onLoadError,
  onDelimiterChange,
  onPreview,
  onCancel,
  onBack,
  onTargetChange,
  onSubmit,
  onMouseClick,
}: ExchangeImportDialogProps) {
  const headingId = useId();
  const summaryId = useId();
  const warningsId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const onFocusRequestAppliedRef = useRef(onFocusRequestApplied);

  useDialogFocusTrap({
    dialogRef,
    overlayRef,
    onEscape: screen === "preview" ? onBack : onCancel,
  });
  const shownNotices = useReannouncedNotice(dialogNotices.sequence, dialogNotices);

  useLayoutEffect(() => {
    onFocusRequestAppliedRef.current = onFocusRequestApplied;
  }, [onFocusRequestApplied]);

  const previewContent =
    screen === "preview" && parsed !== null && preview !== null
      ? { parsed, preview }
      : null;
  const hasContent = screen === "input" || previewContent !== null;

  useLayoutEffect(() => {
    if (!hasContent) return;
    switch (focusRequest) {
      case null:
      case "header":
        return;
      case "input": {
        const input = fileInputRef.current;
        if (input === null) return;
        input.focus();
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
        throw new Error(`Unknown exchange import focus request: ${JSON.stringify(unreachable)}`);
      }
    }
    onFocusRequestAppliedRef.current();
  }, [focusRequest, screen, hasContent]);

  const renderScreen = () => {
    if (screen === "input") {
      return (
        <ExchangeImportInputScreen
          headingId={headingId}
          entry={entry}
          fileName={fileName}
          delimiter={delimiter}
          inputError={inputError}
          onFileLoad={onFileLoad}
          onLoadError={onLoadError}
          onDelimiterChange={onDelimiterChange}
          onPreview={onPreview}
          onCancel={onCancel}
          fileInputRef={fileInputRef}
        />
      );
    }
    if (previewContent === null) return null;
    return (
      <ExchangeImportPreviewScreen
        headingId={headingId}
        summaryId={summaryId}
        warningsId={warningsId}
        parsed={previewContent.parsed}
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
        tabIndex={-1}
        aria-modal="true"
        aria-label={DIALOG_LABEL[entry]}
        className="flex max-h-full w-full max-w-[36rem] flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        {screenContent !== null && (
          <div
            key={screen}
            role="group"
            aria-labelledby={headingId}
            aria-describedby={screen === "preview" ? `${summaryId} ${warningsId}` : undefined}
          >
            {screenContent}
          </div>
        )}
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