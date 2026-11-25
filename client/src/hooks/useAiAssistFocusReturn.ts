"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { isRestorableFocusTarget } from "@/components/map/isRestorableFocusTarget";
import { resolveOutlineInitialFocusTarget } from "@/components/map/resolveOutlineInitialFocusTarget";
import type { EditorViewMode } from "@/domain/view/editorViewMode";
import type { AiAssistFocusRequest } from "@/hooks/aiAssistDialogState";

type UseAiAssistFocusReturnOptions = {
  focusRequest: AiAssistFocusRequest;
  consumeFocusRequest: () => void;
  viewMode: EditorViewMode;
  // マップ表示での戻り先（キャンバス）。アウトライン表示では選択行などへ戻す
  canvasRef: RefObject<HTMLElement | null>;
};

type UseAiAssistFocusReturnResult = {
  // 右パネルの「AI支援」の節のボタン。パネルから開いたときの戻り先
  summaryButtonRef: RefObject<HTMLButtonElement | null>;
  importanceButtonRef: RefObject<HTMLButtonElement | null>;
};

// AI 支援のダイアログを閉じた後のフォーカスの戻し。閉じる描画で根の inert が外れた後に当てる（L-155）。
// 右パネルから開いたときはそのボタンへ（無効ならキャンバスへ）、パレットから開いたときはキャンバスへ戻す
export function useAiAssistFocusReturn({
  focusRequest,
  consumeFocusRequest,
  viewMode,
  canvasRef,
}: UseAiAssistFocusReturnOptions): UseAiAssistFocusReturnResult {
  const summaryButtonRef = useRef<HTMLButtonElement>(null);
  const importanceButtonRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusRequest === null) return;
    const canvasTarget = viewMode === "map" ? canvasRef.current : resolveOutlineInitialFocusTarget();
    const panelButton = focusRequest.kind === "branch-summary"
      ? summaryButtonRef.current
      : importanceButtonRef.current;
    const candidates: Array<HTMLElement | null> = focusRequest.target === "panel"
      ? [panelButton, canvasTarget]
      : [canvasTarget];
    candidates.find((candidate) => isRestorableFocusTarget(candidate))?.focus();
    consumeFocusRequest();
  }, [focusRequest, consumeFocusRequest, viewMode, canvasRef]);
  return { summaryButtonRef, importanceButtonRef };
}
