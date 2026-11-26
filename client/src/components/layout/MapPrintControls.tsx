import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPrintDialog, type MapPrintDraft } from "@/components/layout/MapPrintDialog";
import type { useMapPrintExport } from "@/hooks/useMapPrintExport";
import { DEFAULT_MAP_PRINT_SETTINGS } from "@/types/mapPrintExport";
import type { Node } from "@/types/node";

type MapPrintControlsProps = {
  nodes: readonly Node[];
  enabled: boolean;
  disabledReason?: string;
  canOpen: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  print: ReturnType<typeof useMapPrintExport>;
  onMouseClick: () => void;
};

export function MapPrintControls({
  nodes, enabled, disabledReason, canOpen, open, onOpen, onClose, print, onMouseClick,
}: MapPrintControlsProps) {
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);
  const [draft, setDraft] = useState<MapPrintDraft>(() => {
    const { top, right, bottom, left } = DEFAULT_MAP_PRINT_SETTINGS.margins;
    return {
      ...DEFAULT_MAP_PRINT_SETTINGS,
      margins: { top: String(top), right: String(right), bottom: String(bottom), left: String(left) },
    };
  });

  useLayoutEffect(() => {
    // モーダルが閉じ、エディタの inert が外れた後に入口へ戻す。
    if (wasOpenRef.current && !open) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200"
        disabled={!enabled || !canOpen}
        aria-label={!enabled && disabledReason ? `PDF・印刷設定（${disabledReason}）` : undefined}
        title={!enabled ? disabledReason : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => {
          if (nodes.length === 0) {
            print.start(DEFAULT_MAP_PRINT_SETTINGS);
            return;
          }
          print.clearNotice();
          onOpen();
        }}
      >
        PDF・印刷設定
      </button>
      {open && createPortal(
        <MapPrintDialog
          id={dialogId}
          nodes={nodes}
          unavailableReason={!enabled ? disabledReason ?? "この書き出し対象では使えません。" : undefined}
          draft={draft}
          onDraftChange={setDraft}
          print={print}
          onClose={onClose}
          onMouseClick={onMouseClick}
        />,
        document.body,
      )}
    </>
  );
}
