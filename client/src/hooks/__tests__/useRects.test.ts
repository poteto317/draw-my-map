import { renderHook, act } from "@testing-library/react";
import { useRects } from "@/hooks/useRects";
import { RECT_WIDTH, RECT_HEIGHT } from "@/config/shapes";

describe("useRects", () => {
  it("初期状態では rects が空配列である", () => {
    const { result } = renderHook(() => useRects());
    expect(result.current.rects).toEqual([]);
  });

  it("addRect を呼ぶと rects に1件追加される", () => {
    const { result } = renderHook(() => useRects());

    act(() => {
      result.current.addRect(200, 150);
    });

    expect(result.current.rects).toHaveLength(1);
  });

  it("追加した rect の位置はクリック座標を中心とした左上座標になる", () => {
    const { result } = renderHook(() => useRects());
    const clickX = 200;
    const clickY = 150;

    act(() => {
      result.current.addRect(clickX, clickY);
    });

    const rect = result.current.rects[0];
    expect(rect.x).toBe(clickX - RECT_WIDTH / 2);
    expect(rect.y).toBe(clickY - RECT_HEIGHT / 2);
  });

  it("追加した rect のサイズは定数値と一致する", () => {
    const { result } = renderHook(() => useRects());

    act(() => {
      result.current.addRect(0, 0);
    });

    const rect = result.current.rects[0];
    expect(rect.width).toBe(RECT_WIDTH);
    expect(rect.height).toBe(RECT_HEIGHT);
  });

  it("addRect を複数回呼ぶと rects が蓄積される", () => {
    const { result } = renderHook(() => useRects());

    act(() => {
      result.current.addRect(100, 100);
      result.current.addRect(200, 200);
      result.current.addRect(300, 300);
    });

    expect(result.current.rects).toHaveLength(3);
  });

  it("各 rect の id はユニークな数値である", () => {
    let counter = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++counter);

    const { result } = renderHook(() => useRects());

    act(() => {
      result.current.addRect(100, 100);
      result.current.addRect(200, 200);
    });

    const ids = result.current.rects.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(2);
    ids.forEach((id) => expect(typeof id).toBe("number"));

    jest.restoreAllMocks();
  });
});
