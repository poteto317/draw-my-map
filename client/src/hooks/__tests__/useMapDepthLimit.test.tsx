import { renderHook, act } from "@testing-library/react";
import { useMapDepthLimit } from "@/hooks/useMapDepthLimit";
import { createTestNode } from "@/testing/createTestNode";

describe("useMapDepthLimit", () => {
  const nodes = [
    createTestNode({ id: 1, parentId: null, label: "R" }),
    createTestNode({ id: 2, parentId: 1, label: "C" }),
  ];

  it("無制限なら全 ID を含む", () => {
    const { result } = renderHook(() => useMapDepthLimit(nodes));
    expect([...result.current.depthVisibleNodeIds].sort()).toEqual([1, 2]);
  });

  it("深さ 0 ならルートのみ", () => {
    const { result } = renderHook(() => useMapDepthLimit(nodes));
    act(() => result.current.setMaxDepth(0));
    expect([...result.current.depthVisibleNodeIds]).toEqual([1]);
  });
});