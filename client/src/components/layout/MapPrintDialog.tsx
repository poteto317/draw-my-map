import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { MapOperationNotice } from "@/components/layout/MapOperationNotice";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { MAP_PRINT_FAILURE_MESSAGES } from "@/domain/printExport/mapPrintMessages";
import {
  MAP_PRINT_MARGIN_MAX_MM,
  MAP_PRINT_MARGIN_MIN_MM,
  MAP_PRINT_MARGIN_STEP_MM,
  parseMapPrintMargin,
} from "@/domain/printExport/mapPrintSettings";
import type { useMapPrintExport } from "@/hooks/useMapPrintExport";
import { useMapPrintPreview } from "@/hooks/useMapPrintPreview";
import type { MapPrintSettings } from "@/types/mapPrintExport";
import type { Node } from "@/types/node";

type MarginSide = keyof MapPrintSettings["margins"];

export type MapPrintDraft = Omit<MapPrintSettings, "margins"> & {
  margins: Record<MarginSide, string>;
};

type MapPrintDialogProps = {
  id: string;
  nodes: readonly Node[];
  unavailableReason: string | undefined;
  draft: MapPrintDraft;
  onDraftChange: (draft: MapPrintDraft) => void;
  print: ReturnType<typeof useMapPrintExport>;
  onClose: () => void;
  onMouseClick: () => void;
};

const MARGIN_FIELDS = [
  { side: "top", label: "上の余白" },
  { side: "right", label: "右の余白" },
  { side: "bottom", label: "下の余白" },
  { side: "left", label: "左の余白" },
] as const;

const inputClassName = "w-full rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900";
const secondaryButtonClassName = "rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600";

export function MapPrintDialog({
  id, nodes, unavailableReason, draft, onDraftChange, print, onClose, onMouseClick,
}: MapPrintDialogProps) {
  const { state, notice, start, cancel, finish } = print;
  const headingId = useId();
  const marginErrorId = useId();
  const instructionsId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLSelectElement>(null);
  const operationRef = useRef<HTMLButtonElement>(null);

  function dismiss() {
    if (state === "printing") return;
    if (state === "preparing") cancel();
    onClose();
  }

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: dismiss });
  useLayoutEffect(() => {
    const target = state === "idle" ? paperRef.current : operationRef.current;
    target?.focus();
  }, [state]);

  const settings: MapPrintSettings = {
    ...draft,
    margins: {
      top: parseMapPrintMargin(draft.margins.top),
      right: parseMapPrintMargin(draft.margins.right),
      bottom: parseMapPrintMargin(draft.margins.bottom),
      left: parseMapPrintMargin(draft.margins.left),
    },
  };
  const hasInvalidMargin = MARGIN_FIELDS.some(({ side }) => Number.isNaN(settings.margins[side]));
  const { layout, error: previewError } = useMapPrintPreview({ nodes, settings, unavailableReason });

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
    >
      <div
        id={id}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">PDF・印刷設定</h2>
        {state === "idle" ? (
          <form
            className="flex flex-col gap-3 text-sm"
            aria-describedby={instructionsId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (layout) start(settings);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                用紙サイズ
                <select
                  ref={paperRef}
                  value={draft.paperSize}
                  className={inputClassName}
                  onChange={(event) => onDraftChange({ ...draft, paperSize: event.currentTarget.value as MapPrintSettings["paperSize"] })}
                >
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="letter">Letter</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                方向
                <select
                  value={draft.orientation}
                  className={inputClassName}
                  onChange={(event) => onDraftChange({ ...draft, orientation: event.currentTarget.value as MapPrintSettings["orientation"] })}
                >
                  <option value="portrait">縦</option>
                  <option value="landscape">横</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend className="mb-1">余白（mm）</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MARGIN_FIELDS.map(({ side, label }) => {
                  const invalid = Number.isNaN(settings.margins[side]);
                  return (
                    <label key={side} className="flex flex-col gap-1">
                      {label}
                      <input
                        type="number"
                        required
                        min={MAP_PRINT_MARGIN_MIN_MM}
                        max={MAP_PRINT_MARGIN_MAX_MM}
                        step={MAP_PRINT_MARGIN_STEP_MM}
                        value={draft.margins[side]}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? marginErrorId : undefined}
                        className={inputClassName}
                        onChange={(event) => onDraftChange({ ...draft, margins: { ...draft.margins, [side]: event.currentTarget.value } })}
                      />
                    </label>
                  );
                })}
              </div>
              {hasInvalidMargin && (
                <p id={marginErrorId} role="alert" className="mt-1 text-red-700 dark:text-red-300">
                  {MAP_PRINT_FAILURE_MESSAGES["invalid-settings"]}指数表記は使えません。
                </p>
              )}
            </fieldset>
            <label className="flex flex-col gap-1">
              配置
              <select
                value={draft.pagination}
                className={inputClassName}
                onChange={(event) => onDraftChange({ ...draft, pagination: event.currentTarget.value as MapPrintSettings["pagination"] })}
              >
                <option value="fit">全体を1ページ</option>
                <option value="tile">実寸で複数ページに分割</option>
              </select>
            </label>
            {layout && <p role="status" className="font-medium">{layout.pages.length}ページ（{layout.columns}列 × {layout.rows}行）</p>}
            {previewError && <MapOperationNotice notice={{ kind: "error", message: previewError }} />}
            {notice && notice.kind !== "status" && <MapOperationNotice notice={notice} />}
            <p id={instructionsId} className="text-zinc-600 dark:text-zinc-300">
              実寸では96pxを25.4mmとして扱います。PDFとして保存するには、次の印刷画面で「PDFとして保存」を選んでください。用紙サイズを合わせ、倍率を100%にし、ヘッダーとフッターをオフにしてください。
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButtonClassName} onClick={dismiss}>閉じる</button>
              <button type="submit" disabled={!layout} className="rounded bg-blue-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">
                印刷画面を開く
              </button>
            </div>
          </form>
        ) : (
          <>
            <p role="status" className="text-sm">
              {state === "preparing" ? "印刷を準備しています。" : "印刷画面を閉じたら「印刷を終了」を押してください。"}
            </p>
            <div className="flex justify-end">
              <button
                ref={operationRef}
                type="button"
                className={secondaryButtonClassName}
                onClick={state === "preparing" ? dismiss : finish}
              >
                {state === "preparing" ? "キャンセル" : "印刷を終了"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
