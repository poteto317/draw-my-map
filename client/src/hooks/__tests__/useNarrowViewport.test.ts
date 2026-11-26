import { act, renderHook } from "@testing-library/react";
import type { EditorViewMode } from "@/domain/view/editorViewMode";
import { narrowViewportMediaQuery } from "@/domain/view/narrowViewport";
import { useNarrowViewport } from "@/hooks/useNarrowViewport";
import { installNarrowViewportMatchMedia } from "@/testing/mockNarrowViewportMatchMedia";

function mountHook(
  overrides: Partial<{
    mapId: string;
    storageMode: "persistent" | "protected";
    viewMode: EditorViewMode;
    applyViewMode: (mode: EditorViewMode) => void;
    suppressOutlineOverride: boolean;
  }> = {},
) {
  const applyViewMode = overrides.applyViewMode ?? jest.fn();
  return {
    applyViewMode,
    ...renderHook(
      (props: {
        mapId: string;
        storageMode: "persistent" | "protected";
        viewMode: EditorViewMode;
        suppressOutlineOverride: boolean;
      }) => useNarrowViewport({
        mapId: props.mapId,
        storageMode: props.storageMode,
        viewMode: props.viewMode,
        applyViewMode,
        suppressOutlineOverride: props.suppressOutlineOverride,
      }),
      {
        initialProps: {
          mapId: overrides.mapId ?? "map-a",
          storageMode: overrides.storageMode ?? "persistent",
          viewMode: overrides.viewMode ?? "map",
          suppressOutlineOverride: overrides.suppressOutlineOverride ?? false,
        },
      },
    ),
  };
}

describe("useNarrowViewport", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("matchMedia クエリに設計の定数を使う", () => {
    const matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
    mountHook();
    expect(matchMedia).toHaveBeenCalledWith(narrowViewportMediaQuery());
  });

  it("狭幅で userChoseMapOnNarrow が無いとき map を outline へ", () => {
    installNarrowViewportMatchMedia(true);
    const applyViewMode = jest.fn();
    mountHook({ applyViewMode });
    expect(applyViewMode).toHaveBeenCalledWith("outline");
  });

  it("suppressOutlineOverride 中は狭幅でも map を outline へ上書きしない", () => {
    installNarrowViewportMatchMedia(true);
    const applyViewMode = jest.fn();
    mountHook({ applyViewMode, viewMode: "map", suppressOutlineOverride: true });
    expect(applyViewMode).not.toHaveBeenCalled();
  });

  it("狭幅で userChoseMapOnNarrow 中は outline へ上書きしない", () => {
    const media = installNarrowViewportMatchMedia(true);
    const applyViewMode = jest.fn();
    const { result, rerender } = mountHook({ applyViewMode, viewMode: "map" });
    act(() => {
      result.current.recordManualViewModeChange("map");
    });
    rerender({
      mapId: "map-a",
      storageMode: "persistent",
      viewMode: "map",
      suppressOutlineOverride: false,
    });
    applyViewMode.mockClear();
    act(() => {
      media.setMatches(false);
    });
    act(() => {
      media.setMatches(true);
    });
    expect(applyViewMode).not.toHaveBeenCalled();
    expect(result.current.userChoseMapOnNarrow).toBe(true);
  });

  it("狭→広では viewMode を変更しない", () => {
    const media = installNarrowViewportMatchMedia(true);
    const applyViewMode = jest.fn();
    const { rerender } = mountHook({ applyViewMode, viewMode: "outline" });
    applyViewMode.mockClear();
    act(() => {
      media.setMatches(false);
    });
    rerender({
      mapId: "map-a",
      storageMode: "persistent",
      viewMode: "outline",
      suppressOutlineOverride: false,
    });
    expect(applyViewMode).not.toHaveBeenCalled();
  });

  it("mapId 変更で userChoseMapOnNarrow をリセットする", () => {
    installNarrowViewportMatchMedia(true);
    const applyViewMode = jest.fn();
    const { result, rerender } = mountHook({ applyViewMode, viewMode: "map" });
    act(() => {
      result.current.recordManualViewModeChange("map");
    });
    expect(result.current.userChoseMapOnNarrow).toBe(true);
    rerender({
      mapId: "map-b",
      storageMode: "persistent",
      viewMode: "map",
      suppressOutlineOverride: false,
    });
    expect(result.current.userChoseMapOnNarrow).toBe(false);
  });

  it("保護モード再構築（storageMode 変更）で userChoseMapOnNarrow をリセットする", () => {
    installNarrowViewportMatchMedia(true);
    const applyViewMode = jest.fn();
    const { result, rerender } = mountHook({ applyViewMode, viewMode: "map" });
    act(() => {
      result.current.recordManualViewModeChange("map");
    });
    expect(result.current.userChoseMapOnNarrow).toBe(true);
    rerender({
      mapId: "map-a",
      storageMode: "protected",
      viewMode: "map",
      suppressOutlineOverride: false,
    });
    expect(result.current.userChoseMapOnNarrow).toBe(false);
  });
});