import { renderHook } from "@testing-library/react";
import { useMapEditorTourAndPresentation } from "@/hooks/useMapEditorTourAndPresentation";
import type { MapTour } from "@/types/mapTour";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

function view(offsetX: number): MapViewSnapshot {
  return {
    viewport: { offsetX, offsetY: 0, scale: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
    focusRootId: null,
    collapsedNodeIds: [],
    resolutionMode: "auto",
    autoResolutionLevel: "all",
  };
}

const tour: MapTour = {
  version: 1,
  title: "案内",
  steps: [{ id: "s1", snapshot: view(0) }],
};

const noopTourMutation = () => ({ ok: true } as const);

function mountHook(
  conflictState: "none" | "conflict",
  storageMode: "persistent" | "protected",
  voiceListening = false,
) {
  return renderHook(() => useMapEditorTourAndPresentation({
    tour,
    storageMode,
    conflictState,
    voiceListening,
    captureView: () => view(0),
    applyView: () => true,
    createTour: noopTourMutation,
    removeTour: noopTourMutation,
    setTourTitle: noopTourMutation,
    addTourStep: noopTourMutation,
    removeTourStep: noopTourMutation,
    reorderTourStep: noopTourMutation,
    overwriteTourStepSnapshot: noopTourMutation,
    setTourStepCaption: noopTourMutation,
  }));
}

describe("useMapEditorTourAndPresentation", () => {
  it("保護モードではツアー編集不可だが再生開始は競合・外部削除時のみ止める", () => {
    const { result: protectedResult } = mountHook("none", "protected");
    expect(protectedResult.current.tourEditDisabled).toBe(true);
    expect(protectedResult.current.presentationStartDisabled).toBe(false);

    const { result: conflictResult } = mountHook("conflict", "persistent");
    expect(conflictResult.current.tourEditDisabled).toBe(true);
    expect(conflictResult.current.presentationStartDisabled).toBe(true);
  });

  it("外部削除では編集・再生開始とも無効", () => {
    const { result } = renderHook(() => useMapEditorTourAndPresentation({
      tour,
      storageMode: "persistent",
      conflictState: "externallyDeleted",
      voiceListening: false,
      captureView: () => view(0),
      applyView: () => true,
      createTour: noopTourMutation,
      removeTour: noopTourMutation,
      setTourTitle: noopTourMutation,
      addTourStep: noopTourMutation,
      removeTourStep: noopTourMutation,
      reorderTourStep: noopTourMutation,
      overwriteTourStepSnapshot: noopTourMutation,
      setTourStepCaption: noopTourMutation,
    }));
    expect(result.current.tourEditDisabled).toBe(true);
    expect(result.current.presentationStartDisabled).toBe(true);
  });

  it("listening 中は tourHeaderDisabled が true（inventory P31-N1）", () => {
    const { result } = mountHook("none", "persistent", true);
    expect(result.current.tourHeaderDisabled).toBe(true);
    expect(result.current.tourEditDisabled).toBe(false);
  });

  it("previewTourStep は該当ステップのビューを applyView する", () => {
    const applyView = jest.fn(() => true);
    const { result } = renderHook(() => useMapEditorTourAndPresentation({
      tour,
      storageMode: "persistent",
      conflictState: "none",
      voiceListening: false,
      captureView: () => view(0),
      applyView,
      createTour: noopTourMutation,
      removeTour: noopTourMutation,
      setTourTitle: noopTourMutation,
      addTourStep: noopTourMutation,
      removeTourStep: noopTourMutation,
      reorderTourStep: noopTourMutation,
      overwriteTourStepSnapshot: noopTourMutation,
      setTourStepCaption: noopTourMutation,
    }));
    result.current.previewTourStep("s1");
    expect(applyView).toHaveBeenCalledWith(view(0));
  });

  it("previewTourStep は未知の stepId では applyView を呼ばない", () => {
    const applyView = jest.fn(() => true);
    const { result } = renderHook(() => useMapEditorTourAndPresentation({
      tour,
      storageMode: "persistent",
      conflictState: "none",
      voiceListening: false,
      captureView: () => view(0),
      applyView,
      createTour: noopTourMutation,
      removeTour: noopTourMutation,
      setTourTitle: noopTourMutation,
      addTourStep: noopTourMutation,
      removeTourStep: noopTourMutation,
      reorderTourStep: noopTourMutation,
      overwriteTourStepSnapshot: noopTourMutation,
      setTourStepCaption: noopTourMutation,
    }));
    result.current.previewTourStep("missing");
    expect(applyView).not.toHaveBeenCalled();
  });
});