"use client";

import { useCallback, useState } from "react";
import type {
  CreateTourOutcome,
  TourMutationOutcome,
  TourStepOutcome,
} from "@/hooks/useMapTourActions";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import { MAP_TOUR_CAPTION_MAX_CODEPOINTS, type MapTour } from "@/types/mapTour";

export type TourEditorScreen = "closed" | "open";
export type TourEditorFocusRequest = "title" | "header";

export type TourEditorDialogNotices = {
  sequence: number;
  status: string | null;
  alert: string | null;
};

export type UseMapTourEditorOptions = {
  tour: MapTour | undefined;
  editDisabled: boolean;
  captureView: () => MapViewSnapshot;
  createTour: (title: string) => CreateTourOutcome;
  removeTour: () => TourMutationOutcome;
  setTourTitle: (title: string) => TourMutationOutcome;
  addTourStep: (snapshot: MapViewSnapshot) => TourStepOutcome;
  removeTourStep: (stepId: string) => TourMutationOutcome;
  reorderTourStep: (fromIndex: number, toIndex: number) => TourMutationOutcome;
  overwriteTourStepSnapshot: (stepId: string, snapshot: MapViewSnapshot) => TourMutationOutcome;
  setTourStepCaption: (stepId: string, caption: string) => TourMutationOutcome;
};

export type UseMapTourEditorReturn = {
  screen: TourEditorScreen;
  selectedStepId: string | null;
  titleDraft: string;
  captionDraft: string;
  dialogNotices: TourEditorDialogNotices;
  focusRequest: TourEditorFocusRequest | null;
  open: () => void;
  close: () => void;
  setTitleDraft: (title: string) => void;
  setCaptionDraft: (caption: string) => void;
  selectStep: (stepId: string | null) => void;
  submitCreateTour: () => void;
  submitSetTitle: () => void;
  submitRemoveTour: () => void;
  submitAddStep: () => void;
  submitRemoveSelectedStep: () => void;
  submitMoveSelectedStepUp: () => void;
  submitMoveSelectedStepDown: () => void;
  submitOverwriteSelectedStep: () => void;
  submitSetCaption: () => void;
  consumeFocusRequest: () => void;
};

function initialNotices(): TourEditorDialogNotices {
  return { sequence: 0, status: null, alert: null };
}

function showStatus(state: TourEditorDialogNotices, message: string): TourEditorDialogNotices {
  return { sequence: state.sequence + 1, status: message, alert: null };
}

function showAlert(state: TourEditorDialogNotices, message: string): TourEditorDialogNotices {
  return { sequence: state.sequence + 1, status: null, alert: message };
}

function tourFailureMessage(reason: string): string {
  switch (reason) {
    case "invalid-title":
      return "タイトルは前後の空白を除いて1〜80文字で入力してください。";
    case "already-exists":
      return "ツアーはすでにあります。";
    case "step-limit":
      return "ステップは最大50件までです。";
    case "missing-tour":
      return "先にツアーを作成してください。";
    case "missing-step":
      return "ステップが見つかりません。";
    case "noop":
      return "変更はありません。";
    case "invalid-caption":
      return `キャプションは前後の空白を除いて1〜${MAP_TOUR_CAPTION_MAX_CODEPOINTS}文字で入力してください。`;
    default:
      return "操作を完了できませんでした。";
  }
}

export function useMapTourEditor(options: UseMapTourEditorOptions): UseMapTourEditorReturn {
  const {
    tour,
    editDisabled,
    captureView,
    createTour,
    removeTour,
    setTourTitle,
    addTourStep,
    removeTourStep,
    reorderTourStep,
    overwriteTourStepSnapshot,
    setTourStepCaption,
  } = options;

  const [screen, setScreen] = useState<TourEditorScreen>("closed");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [titleDraft, setTitleDraftState] = useState("");
  const [captionDraft, setCaptionDraftState] = useState("");
  const [dialogNotices, setDialogNotices] = useState(initialNotices);
  const [focusRequest, setFocusRequest] = useState<TourEditorFocusRequest | null>(null);

  const open = useCallback(() => {
    if (editDisabled) return;
    setTitleDraftState(tour?.title ?? "");
    setDialogNotices(initialNotices());
    setSelectedStepId(tour?.steps[0]?.id ?? null);
    const first = tour?.steps[0];
    setCaptionDraftState(first?.caption ?? "");
    setFocusRequest(tour === undefined ? "title" : null);
    setScreen("open");
  }, [editDisabled, tour]);

  const close = useCallback(() => {
    setScreen("closed");
    setFocusRequest("header");
  }, []);

  const setTitleDraft = useCallback((title: string) => {
    setTitleDraftState(title);
  }, []);

  const setCaptionDraft = useCallback((caption: string) => {
    setCaptionDraftState(caption);
  }, []);

  const selectStep = useCallback((stepId: string | null) => {
    setSelectedStepId(stepId);
    if (stepId === null || tour === undefined) {
      setCaptionDraftState("");
      return;
    }
    const step = tour.steps.find((item) => item.id === stepId);
    setCaptionDraftState(step?.caption ?? "");
  }, [tour]);

  const submitCreateTour = useCallback(() => {
    if (editDisabled) return;
    const result = createTour(titleDraft);
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    setDialogNotices((state) => showStatus(state, "ツアーを作成しました。"));
    setFocusRequest(null);
  }, [createTour, editDisabled, titleDraft]);

  const submitSetTitle = useCallback(() => {
    if (editDisabled) return;
    const result = setTourTitle(titleDraft);
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    setDialogNotices((state) => showStatus(state, "タイトルを更新しました。"));
  }, [editDisabled, setTourTitle, titleDraft]);

  const submitRemoveTour = useCallback(() => {
    if (editDisabled) return;
    const result = removeTour();
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    setTitleDraftState("");
    setCaptionDraftState("");
    setSelectedStepId(null);
    setDialogNotices((state) => showStatus(state, "ツアーを削除しました。"));
  }, [editDisabled, removeTour]);

  const submitAddStep = useCallback(() => {
    if (editDisabled) return;
    const result = addTourStep(captureView());
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    if (result.stepId !== undefined) {
      setSelectedStepId(result.stepId);
      setCaptionDraftState("");
    }
    setDialogNotices((state) => showStatus(state, "ステップを追加しました。"));
  }, [addTourStep, captureView, editDisabled]);

  const submitRemoveSelectedStep = useCallback(() => {
    if (editDisabled || selectedStepId === null || tour === undefined) return;
    const removedIndex = tour.steps.findIndex((step) => step.id === selectedStepId);
    const result = removeTourStep(selectedStepId);
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    const remaining = tour.steps.filter((step) => step.id !== selectedStepId);
    if (remaining.length === 0) {
      setSelectedStepId(null);
      setCaptionDraftState("");
    } else {
      const next = remaining[Math.min(removedIndex, remaining.length - 1)]!;
      setSelectedStepId(next.id);
      setCaptionDraftState(next.caption ?? "");
    }
    setDialogNotices((state) => showStatus(state, "ステップを削除しました。"));
  }, [editDisabled, removeTourStep, selectedStepId, tour]);

  const findSelectedIndex = useCallback((): number | null => {
    if (selectedStepId === null || tour === undefined) return null;
    const index = tour.steps.findIndex((step) => step.id === selectedStepId);
    return index < 0 ? null : index;
  }, [selectedStepId, tour]);

  const submitMoveSelectedStepUp = useCallback(() => {
    const index = findSelectedIndex();
    if (editDisabled || index === null || index === 0) return;
    const result = reorderTourStep(index, index - 1);
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    setDialogNotices((state) => showStatus(state, "ステップを上へ移動しました。"));
  }, [editDisabled, findSelectedIndex, reorderTourStep]);

  const submitMoveSelectedStepDown = useCallback(() => {
    const index = findSelectedIndex();
    if (editDisabled || index === null || tour === undefined || index >= tour.steps.length - 1) return;
    const result = reorderTourStep(index, index + 1);
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    setDialogNotices((state) => showStatus(state, "ステップを下へ移動しました。"));
  }, [editDisabled, findSelectedIndex, reorderTourStep, tour]);

  const submitOverwriteSelectedStep = useCallback(() => {
    if (editDisabled || selectedStepId === null) return;
    const result = overwriteTourStepSnapshot(selectedStepId, captureView());
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    setDialogNotices((state) => showStatus(state, "表示をステップに上書きしました。"));
  }, [captureView, editDisabled, overwriteTourStepSnapshot, selectedStepId]);

  const submitSetCaption = useCallback(() => {
    if (editDisabled || selectedStepId === null) return;
    const result = setTourStepCaption(selectedStepId, captionDraft);
    if (!result.ok) {
      setDialogNotices((state) => showAlert(state, tourFailureMessage(result.reason)));
      return;
    }
    setDialogNotices((state) => showStatus(state, "キャプションを更新しました。"));
  }, [captionDraft, editDisabled, selectedStepId, setTourStepCaption]);

  const consumeFocusRequest = useCallback(() => {
    setFocusRequest(null);
  }, []);

  return {
    screen,
    selectedStepId,
    titleDraft,
    captionDraft,
    dialogNotices,
    focusRequest,
    open,
    close,
    setTitleDraft,
    setCaptionDraft,
    selectStep,
    submitCreateTour,
    submitSetTitle,
    submitRemoveTour,
    submitAddStep,
    submitRemoveSelectedStep,
    submitMoveSelectedStepUp,
    submitMoveSelectedStepDown,
    submitOverwriteSelectedStep,
    submitSetCaption,
    consumeFocusRequest,
  };
}