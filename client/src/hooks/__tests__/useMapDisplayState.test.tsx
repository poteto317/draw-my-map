import { renderHook } from "@testing-library/react";

import { collectVisibleNodeIds } from "@/domain/nodes/nodeVisibility";
import { useMapDisplayState } from "@/hooks/useMapDisplayState";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label: `node-${id}`, ...overrides });
}

describe("useMapDisplayState", () => {
  it("解像度集合Rだけが変わるとdisplayNodes参照を維持してVだけを更新する", () => {
    const nodes = [node(1, null), node(2, 1), node(3, 1)];
    const collapseVisibleNodeIds = new Set([1, 2]);
    const { result, rerender } = renderHook(
      ({ resolutionVisibleNodeIds }) => useMapDisplayState({
        nodes,
        layoutMode: "auto",
        collapseVisibleNodeIds,
        resolutionVisibleNodeIds,
      }),
      { initialProps: { resolutionVisibleNodeIds: new Set([1, 2, 3]) } },
    );
    const initialDisplayNodes = result.current.displayNodes;

    rerender({ resolutionVisibleNodeIds: new Set([1]) });

    expect(result.current.displayNodes).toBe(initialDisplayNodes);
    expect([...result.current.visibleNodeIds]).toEqual([1]);
  });

  it("低重要度A配下の高重要度BがRへ祖先を含めても、A折りたたみのCを突き破らない", () => {
    const nodes = [
      node(1, null, { importance: "low" }),
      node(2, 1, { importance: "high" }),
    ];
    const resolutionVisibleNodeIds = collectVisibleNodeIds(nodes, "high");

    const { result } = renderHook(() => useMapDisplayState({
      nodes,
      layoutMode: "auto",
      collapseVisibleNodeIds: new Set([1]),
      resolutionVisibleNodeIds,
    }));

    expect([...resolutionVisibleNodeIds]).toEqual([1, 2]);
    expect([...result.current.visibleNodeIds]).toEqual([1]);
  });

  it("配置失敗でも折りたたみと解像度の積集合を維持する", () => {
    const nodes = [
      node(1, null, { y: 2 ** 57 }),
      node(2, 1),
      node(3, 1),
      node(4, 1),
    ];

    const { result } = renderHook(() => useMapDisplayState({
      nodes,
      layoutMode: "auto",
      collapseVisibleNodeIds: new Set([1, 2, 3]),
      resolutionVisibleNodeIds: new Set([1, 3, 4]),
    }));

    expect(result.current.displayNodes).toBe(nodes);
    expect(result.current.layoutFailed).toBe(true);
    expect([...result.current.visibleNodeIds]).toEqual([1, 3]);
  });

  it("10,000階層の直線木の中間を閉じたCでも再帰エラーなく投影とVを導出する", () => {
    const count = 10_000;
    const nodes = Array.from({ length: count }, (_, index) => node(index + 1, index === 0 ? null : index));
    const collapseVisibleNodeIds = new Set(nodes.slice(0, 5_000).map((item) => item.id));
    const resolutionVisibleNodeIds = new Set(nodes.map((item) => item.id));

    const { result } = renderHook(() => useMapDisplayState({
      nodes,
      layoutMode: "auto",
      collapseVisibleNodeIds,
      resolutionVisibleNodeIds,
    }));

    expect(result.current.layoutFailed).toBe(false);
    expect(result.current.displayNodes).toHaveLength(count);
    expect(result.current.displayNodes[count - 1]).toBe(nodes[count - 1]);
    expect(result.current.visibleNodeIds.size).toBe(5_000);
    expect(result.current.visibleNodeIds.has(5_000)).toBe(true);
    expect(result.current.visibleNodeIds.has(5_001)).toBe(false);
  });
});
