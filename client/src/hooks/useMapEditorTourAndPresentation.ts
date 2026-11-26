"use client";

import { useCallback, useMemo, useRef, type RefObject } from "react";
import { resolveTourPresentationGuards } from "@/domain/map/mapTourPresentationAvailability";
import type { ConflictState } from "@/domain/mapLibrary/mapConflict";
import type { CreateTourOutcome, TourMutationOutcome, TourStepOutcome } from "@/hooks/useMapTourActions";
import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";
import { useMapTourEditor, type UseMapTourEditorReturn } from "@/hooks/useMapTourEditor";
import {
  usePresentationPlayback,
  type ApplyMapView,
  type UsePresentationPlaybackReturn,
} from "@/hooks/usePresentationPlayback";
import { usePresentationPlaybackKeyboard } from "@/hooks/usePresentationPlaybackKeyboard";
import type { MapTour } from "@/types/mapTour";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

export type MapEditorConflictState = ConflictState;

export type UseMapEditorTourAndPresentationOptions = {
  tour: MapTour | undefined;
  storageMode: "persistent" | "protected";
  conflictState: ConflictState;
  /** 音声 listening 中はツアー編集を塞ぐ（inventory P31-N1）。useMapEditorVoice より先に呼ぶためミラーを渡す */
  voiceListening: boolean;
  captureView: () => MapViewSnapshot;
  applyView: ApplyMapView;
  createTour: (title: string) => CreateTourOutcome;
  removeTour: () => TourMutationOutcome;
  setTourTitle: (title: string) => TourMutationOutcome;
  addTourStep: (snapshot: MapViewSnapshot, stepId?: string) => TourStepOutcome;
  removeTourStep: (stepId: string) => TourMutationOutcome;
  reorderTourStep: (fromIndex: number, toIndex: number) => TourMutationOutcome;
  overwriteTourStepSnapshot: (stepId: string, snapshot: MapViewSnapshot) => TourMutationOutcome;
  setTourStepCaption: (stepId: string, caption: string) => TourMutationOutcome;
};

export type UseMapEditorTourAndPresentationReturn = {
  tourEditor: UseMapTourEditorReturn;
  presentationPlayback: UsePresentationPlaybackReturn;
  tourEditorButtonRef: RefObject<HTMLButtonElement | null>;
  presentationStartButtonRef: RefObject<HTMLButtonElement | null>;
  playingPresentation: boolean;
  tourEditDisabled: boolean;
  tourHeaderDisabled: boolean;
  presentationStartDisabled: boolean;
  previewTourStep: (stepId: string) => void;
};

/** MapEditor 内のツアー編集・プレゼン再生の配線（キーボード・ヘッダーフォーカス戻し含む） */
export function useMapEditorTourAndPresentation({
  tour,
  storageMode,
  conflictState,
  voiceListening,
  captureView,
  applyView,
  createTour,
  removeTour,
  setTourTitle,
  addTourStep,
  removeTourStep,
  reorderTourStep,
  overwriteTourStepSnapshot,
  setTourStepCaption,
}: UseMapEditorTourAndPresentationOptions): UseMapEditorTourAndPresentationReturn {
  const { tourEditDisabled, presentationStartBlocked } = resolveTourPresentationGuards({
    isProtectedMode: storageMode === "protected",
    hasConflict: conflictState === "conflict",
    isExternallyDeleted: conflictState === "externallyDeleted",
  });
  const presentationPlayback = usePresentationPlayback({
    tour,
    startBlocked: presentationStartBlocked,
    captureView,
    applyView,
  });
  const playingPresentation = presentationPlayback.screen === "playing";
  const tourEditor = useMapTourEditor({
    tour,
    editDisabled: tourEditDisabled,
    captureView,
    createTour,
    removeTour,
    setTourTitle,
    addTourStep,
    removeTourStep,
    reorderTourStep,
    overwriteTourStepSnapshot,
    setTourStepCaption,
  });
  const tourEditorButtonRef = useRef<HTMLButtonElement>(null);
  const presentationStartButtonRef = useRef<HTMLButtonElement>(null);
  usePresentationPlaybackKeyboard({
    enabled: playingPresentation,
    canGoBack: presentationPlayback.canGoBack,
    canGoForward: presentationPlayback.canGoForward,
    onBack: presentationPlayback.goBack,
    onForward: presentationPlayback.goForward,
    onEnd: presentationPlayback.end,
  });
  const tourFocusFallbacks = useMemo(
    () => [presentationStartButtonRef] as const satisfies readonly RefObject<HTMLButtonElement | null>[],
    [],
  );
  useHeaderFocusReturn({
    focusRequest: tourEditor.focusRequest,
    consumeFocusRequest: tourEditor.consumeFocusRequest,
    buttonRef: tourEditorButtonRef,
    fallbackRefs: tourFocusFallbacks,
  });
  const tourHeaderDisabled = tourEditDisabled || playingPresentation || voiceListening;
  const presentationStartDisabled = !presentationPlayback.canStart || playingPresentation;
  const previewTourStep = useCallback((stepId: string) => {
    const step = tour?.steps.find((item) => item.id === stepId);
    if (step === undefined) return;
    applyView(step.snapshot);
  }, [applyView, tour]);

  return {
    tourEditor,
    presentationPlayback,
    tourEditorButtonRef,
    presentationStartButtonRef,
    playingPresentation,
    tourEditDisabled,
    tourHeaderDisabled,
    presentationStartDisabled,
    previewTourStep,
  };
}