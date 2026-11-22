import { act, renderHook } from "@testing-library/react";
import { useNodeLayoutState } from "@/hooks/useNodeLayoutState";
import { useSelectionLayoutActions } from "@/hooks/useSelectionLayoutActions";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, x: number, y: number) {
  return createTestNode({ id, parentId: null, x, y, width: 100, height: 60, label: `${id}` });
}

describe("useSelectionLayoutActions", () => {
  it("手動配置での整列を1操作として履歴に積む", () => {
    const { result } = renderHook(() => {
      const layout = useNodeLayoutState();
      const actions = useSelectionLayoutActions({
        nodes: layout.nodes,
        layoutMode: layout.layoutMode,
        selectedNodeIds: [1, 2],
        commitManualNodes: (nextNodes) => layout.applyManualMove(() => nextNodes),
      });
      return { layout, actions };
    });
    const nodes = [node(1, 40, 10), node(2, 220, 80)];

    act(() => {
      result.current.layout.replaceLayoutState({ layoutMode: "manual", nodes });
    });

    act(() => {
      const outcome = result.current.actions.align("align-left");
      expect(outcome).toEqual({ ok: true });
    });

    expect(result.current.layout.nodes.map((item) => item.x)).toEqual([40, 40]);
    expect(result.current.layout.canUndo).toBe(true);

    act(() => {
      result.current.layout.undo();
    });

    expect(result.current.layout.nodes).toEqual(nodes);
  });

  it("自動配置では manual-only を返す", () => {
    const { result } = renderHook(() => {
      const layout = useNodeLayoutState();
      const actions = useSelectionLayoutActions({
        nodes: layout.nodes,
        layoutMode: layout.layoutMode,
        selectedNodeIds: [1, 2],
        commitManualNodes: (nextNodes) => layout.applyManualMove(() => nextNodes),
      });
      return { layout, actions };
    });
    const nodes = [node(1, 0, 0), node(2, 100, 0)];

    act(() => {
      result.current.layout.replaceLayoutState({ layoutMode: "auto", nodes });
    });

    act(() => {
      expect(result.current.actions.align("align-left")).toEqual({ ok: false, reason: "manual-only" });
    });
  });

  it("locked を含む選択では locked を返す", () => {
    const nodes = [
      node(1, 0, 0),
      { ...node(2, 100, 0), locked: true as const },
    ];
    const { result } = renderHook(() => useSelectionLayoutActions({
      nodes,
      layoutMode: "manual",
      selectedNodeIds: [1, 2],
      commitManualNodes: jest.fn(),
    }));

    expect(result.current.unavailableReason).toBe("locked");
    expect(result.current.align("align-left")).toEqual({ ok: false, reason: "locked" });
  });
});