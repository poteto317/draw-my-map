import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

function initialMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "タスクなし", x: 220 }),
      createTestNode({ id: 3, parentId: 1, label: "タスクあり", x: 220, y: 100, task: { completed: false } }),
      createTestNode({ id: 4, label: "ロック", locked: true, task: { completed: false }, x: 400 }),
    ],
  };
}

function renderNodes(initial: NodeMapState = initialMap()) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

function nodeOf(current: Hook, id: number): Node {
  return current.nodes.find((item) => item.id === id)!;
}

describe("useNodes の applyTask", () => {
  it("未設定からタスクを作成し、解除も各 1 Undo で戻る", () => {
    const { result } = renderNodes();

    act(() => {
      expect(result.current.applyTask(2, undefined, { completed: false })).toEqual({ ok: true, changed: true });
    });
    expect(nodeOf(result.current, 2).task).toEqual({ completed: false });
    expect(result.current.canUndo).toBe(true);

    act(() => { result.current.undo(); });
    expect("task" in nodeOf(result.current, 2)).toBe(false);

    act(() => {
      expect(result.current.applyTask(3, { completed: false }, undefined)).toEqual({ ok: true, changed: true });
    });
    expect("task" in nodeOf(result.current, 3)).toBe(false);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 3).task).toEqual({ completed: false });
  });

  it("同値の確定は changed: false で履歴を積まない", () => {
    const { result } = renderNodes();
    const before = result.current.nodes;

    act(() => {
      expect(result.current.applyTask(3, { completed: false }, { completed: false })).toEqual({
        ok: true,
        changed: false,
      });
    });

    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("ロック中のノードは拒否し、何も変えず履歴も積まない", () => {
    const { result } = renderNodes();
    const before = result.current.nodes;

    act(() => {
      expect(result.current.applyTask(4, { completed: false }, { completed: true })).toEqual({
        ok: false,
        reason: "タスクが更新されたか、現在の状態では編集できません。",
      });
    });

    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });
});