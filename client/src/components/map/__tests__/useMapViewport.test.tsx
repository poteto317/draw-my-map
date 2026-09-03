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
    });

    expect(result.current.viewport).toEqual(next);
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
});
