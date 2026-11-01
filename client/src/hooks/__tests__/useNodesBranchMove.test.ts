import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";

const initial: NodeMapState = {
  layoutMode: "manual",
  nodes: [
    createTestNode({ id: 1, parentId: null, x: 0, y: 0 }),
    createTestNode({ id: 2, parentId: 1, x: 300, y: 0 }),
    createTestNode({ id: 3, parentId: null, x: 0, y: 300 }),
  ],
};

function setup() {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

describe("useNodes.moveBranch", () => {
  it("同じイベント内の直前の変更を含む最新状態を1回の履歴へ確定し、根を選択する", () => {
    const { result } = setup();
    let outcome!: ReturnType<typeof result.current.moveBranch>;
    act(() => {
      result.current.updateNodeLabel(2, "直前の変更");
      outcome = result.current.moveBranch(2, 3);
    });
    expect(outcome).toEqual({ ok: true, rootId: 2 });
    expect(result.current.nodes.find(({ id }) => id === 2)).toMatchObject({ parentId: 3, label: "直前の変更" });
    expect(result.current.selectedNodeId).toBe(2);

    const after = result.current.nodes;
    act(() => { result.current.undo(); });
    expect(result.current.nodes.find(({ id }) => id === 2)).toMatchObject({ parentId: 1, label: "直前の変更" });
    act(() => { result.current.redo(); });
    expect(result.current.nodes).toEqual(after);
  });

  it("失敗時は履歴・選択・Redoを変えない", () => {
    const { result } = setup();
    act(() => result.current.updateNodeLabel(1, "履歴用"));
    act(() => { result.current.undo(); });
    act(() => result.current.selectNode(3));
    const before = { nodes: result.current.nodes, selected: result.current.selectedNodeId, canUndo: result.current.canUndo, canRedo: result.current.canRedo };
    let outcome!: ReturnType<typeof result.current.moveBranch>;
    act(() => { outcome = result.current.moveBranch(2, 1); });
    expect(outcome).toEqual({ ok: false, reason: "same-parent" });
    expect({ nodes: result.current.nodes, selected: result.current.selectedNodeId, canUndo: result.current.canUndo, canRedo: result.current.canRedo }).toEqual(before);
    expect(result.current.nodes).toBe(before.nodes);
  });
});
