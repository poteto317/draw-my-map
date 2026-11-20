import { act, renderHook } from "@testing-library/react";
import { useMapViewHistory } from "@/hooks/useMapViewHistory";
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

it("最大50件まで記録し、連続操作で古い表示を落とす", () => {
  let current = view(51);
  const { result } = renderHook(() => useMapViewHistory("map", 0, () => current, (next) => {
    current = next;
    return true;
  }));

  act(() => {
    for (let offsetX = 0; offsetX < 51; offsetX += 1) {
      result.current.recordNavigation(view(offsetX));
    }
  });
  act(() => {
    for (let position = 50; position > 0; position -= 1) {
      expect(result.current.travel("back")).toBe(true);
      expect(current.viewport.offsetX).toBe(position);
    }
    expect(result.current.travel("back")).toBe(false);
  });
  expect(result.current.canGoBack).toBe(false);
  expect(result.current.canGoForward).toBe(true);
});

it("適用が失敗した場合は履歴を変更せず、本文置換の世代が進むと履歴を破棄する", () => {
  const applyView = jest.fn(() => false);
  const { result, rerender } = renderHook(
    ({ mapId, resetRevision }) => useMapViewHistory(mapId, resetRevision, () => view(1), applyView),
    { initialProps: { mapId: "map", resetRevision: 0 } },
  );
  act(() => result.current.recordNavigation(view(0)));
  act(() => expect(result.current.travel("back")).toBe(false));
  expect(applyView).toHaveBeenCalledWith(view(0));
  expect(result.current.canGoBack).toBe(true);
  expect(result.current.canGoForward).toBe(false);

  rerender({ mapId: "map", resetRevision: 1 });
  expect(result.current.canGoBack).toBe(false);
  act(() => result.current.recordNavigation(view(0)));
  rerender({ mapId: "new-map", resetRevision: 1 });
  expect(result.current.canGoBack).toBe(false);
});
