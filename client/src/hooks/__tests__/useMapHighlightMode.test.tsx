import { renderHook, act } from "@testing-library/react";
import { useMapHighlightMode } from "@/hooks/useMapHighlightMode";
import { createTestNode } from "@/testing/createTestNode";

describe("useMapHighlightMode", () => {
  const nodes = [
    createTestNode({ id: 1, parentId: null, label: "R" }),
    createTestNode({ id: 2, parentId: 1, label: "C" }),
  ];
  const visible = new Set([1, 2]);

  it("オフのとき強調集合は空", () => {
    const { result } = renderHook(() => useMapHighlightMode(nodes, visible, new Set(), []));
    expect(result.current.highlightNodeIds.size).toBe(0);
  });

  it("選択枝モードで選択部分木を強調", () => {
    const { result } = renderHook(() => useMapHighlightMode(nodes, visible, new Set(), [2]));
    act(() => result.current.setHighlightMode("selection"));
    expect([...result.current.highlightNodeIds].sort()).toEqual([2]);
  });
});