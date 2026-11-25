"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { isRestorableFocusTarget } from "@/components/map/isRestorableFocusTarget";
import { resolveOutlineInitialFocusTarget } from "@/components/map/resolveOutlineInitialFocusTarget";
import type { EditorViewMode } from "@/domain/view/editorViewMode";
import type { AiAssistFocusRequest } from "@/hooks/aiAssistDialogState";
import type { AiAssistKind } from "@/domain/aiAssist/aiAssistEntryAvailability";

type UseAiAssistFocusReturnOptions = {
  focusRequest: AiAssistFocusRequest;
  consumeFocusRequest: () => void;
  viewMode: EditorViewMode;
  canvasRef: RefObject<HTMLElement | null>;
};

type UseAiAssistFocusReturnResult = {
  summaryButtonRef: RefObject<HTMLButtonElement | null>;
  importanceButtonRef: RefObject<HTMLButtonElement | null>;
  childCandidatesButtonRef: RefObject<HTMLButtonElement | null>;
  classifyReorderButtonRef: RefObject<HTMLButtonElement | null>;
  duplicatesButtonRef: RefObject<HTMLButtonElement | null>;
  missingPerspectivesButtonRef: RefObject<HTMLButtonElement | null>;
};

function panelButtonForKind(
  kind: AiAssistKind,
  refs: UseAiAssistFocusReturnResult,
): RefObject<HTMLButtonElement | null> {
  switch (kind) {
    case "branch-summary":
      return refs.summaryButtonRef;
    case "importance":
      return refs.importanceButtonRef;
    case "child-candidates":
      return refs.childCandidatesButtonRef;
    case "classify-reorder":
      return refs.classifyReorderButtonRef;
    case "duplicates":
      return refs.duplicatesButtonRef;
    case "missing-perspectives":
      return refs.missingPerspectivesButtonRef;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

export function useAiAssistFocusReturn({
  focusRequest,
  consumeFocusRequest,
  viewMode,
  canvasRef,
}: UseAiAssistFocusReturnOptions): UseAiAssistFocusReturnResult {
  const summaryButtonRef = useRef<HTMLButtonElement>(null);
  const importanceButtonRef = useRef<HTMLButtonElement>(null);
  const childCandidatesButtonRef = useRef<HTMLButtonElement>(null);
  const classifyReorderButtonRef = useRef<HTMLButtonElement>(null);
  const duplicatesButtonRef = useRef<HTMLButtonElement>(null);
  const missingPerspectivesButtonRef = useRef<HTMLButtonElement>(null);
  const refs: UseAiAssistFocusReturnResult = {
    summaryButtonRef,
    importanceButtonRef,
    childCandidatesButtonRef,
    classifyReorderButtonRef,
    duplicatesButtonRef,
    missingPerspectivesButtonRef,
  };
  useLayoutEffect(() => {
    if (focusRequest === null) return;
    const canvasTarget = viewMode === "map" ? canvasRef.current : resolveOutlineInitialFocusTarget();
    const panelButton = panelButtonForKind(focusRequest.kind, refs).current;
    const candidates: Array<HTMLElement | null> = focusRequest.target === "panel"
      ? [panelButton, canvasTarget]
      : [canvasTarget];
    candidates.find((candidate) => isRestorableFocusTarget(candidate))?.focus();
    consumeFocusRequest();
  }, [focusRequest, consumeFocusRequest, viewMode, canvasRef]);
  return refs;
}