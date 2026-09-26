import { startTransition } from "react";
import { flushSync } from "react-dom";
import { act, renderHook } from "@testing-library/react";
import { useMapViewport } from "@/components/map/useMapViewport";

describe("useMapViewport", () => {
  it("同一batchのパンを直前のviewportへ蓄積する", () => {
    const { result } = renderHook(() => useMapViewport());

    act(() => {
      result.current.panBy(10, 20);
      result.current.panBy(-3, 4);
    });

    expect(result.current.viewport).toEqual({ offsetX: 7, offsetY: 24, scale: 1 });
    expect(result.current.viewportRef.current).toEqual(result.current.viewport);
  });

  it("絶対viewportを同期的に反映し無効値を拒否する", () => {
    const { result } = renderHook(() => useMapViewport());
    const next = { offsetX: 50, offsetY: -10, scale: 1 };

    act(() => {
      result.current.setViewport(next);
      result.current.setViewport({ offsetX: Number.NaN, offsetY: 0, scale: 1 });
      result.current.setViewport({ offsetX: 0, offsetY: 0, scale: 0.1 });
      result.current.setViewport({ offsetX: 0, offsetY: 0, scale: 100 });
    });

    expect(result.current.viewport).toEqual(next);
    expect(result.current.viewportRef.current).toEqual(next);
  });

  it("更新後もcommand参照を維持する", () => {
    const { result } = renderHook(() => useMapViewport());
    const initial = {
      setViewport: result.current.setViewport,
      panBy: result.current.panBy,
    };

    act(() => result.current.panBy(1, 2));

    expect(result.current.setViewport).toBe(initial.setViewport);
    expect(result.current.panBy).toBe(initial.panBy);
  });

  it("保留中と緊急のパン更新を同じ同期Refへ蓄積する", () => {
    const { result } = renderHook(() => useMapViewport());

    act(() => {
      startTransition(() => result.current.panBy(10, 0));
      flushSync(() => result.current.panBy(0, 20));
    });

    expect(result.current.viewport).toEqual({ offsetX: 10, offsetY: 20, scale: 1 });
    expect(result.current.viewportRef.current).toEqual(result.current.viewport);
  });

  it("同一batchの連続ズームを最新viewportへ適用する", () => {
    const { result } = renderHook(() => useMapViewport());

    act(() => {
      result.current.zoomAt({ x: 100, y: 100 }, 2);
      result.current.zoomAt({ x: 100, y: 100 }, 4);
    });

    expect(result.current.viewport).toEqual({ offsetX: -300, offsetY: -300, scale: 4 });
  });

  it("選択ノードを中央へ移して倍率を維持する", () => {
    const { result } = renderHook(() => useMapViewport());
    const node = { id: 1, parentId: null, x: 100, y: 50, width: 80, height: 40, label: "" , importance: "medium" as const};

    act(() => {
      result.current.zoomAt({ x: 0, y: 0 }, 2);
      result.current.focusNode(node, { width: 800, height: 600 });
    });

    expect(result.current.viewport).toEqual({ offsetX: 120, offsetY: 160, scale: 2 });
  });

  it("更新後もzoomAtとfocusNodeの参照を維持する", () => {
    const { result } = renderHook(() => useMapViewport());
    const zoomAt = result.current.zoomAt;
    const focusNode = result.current.focusNode;

    act(() => result.current.zoomAt({ x: 0, y: 0 }, 2));

    expect(result.current.zoomAt).toBe(zoomAt);
    expect(result.current.focusNode).toBe(focusNode);
  });
});
