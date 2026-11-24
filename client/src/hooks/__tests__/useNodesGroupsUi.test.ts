import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { MapGroup } from "@/types/mapGroup";
import type { NodeMapState } from "@/types/nodeMapState";

function group(partial: Partial<MapGroup> & Pick<MapGroup, "id" | "nodeIds">): MapGroup {
  return { label: "", ...partial };
}

function baseState(extra: Partial<NodeMapState> = {}): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [
      createTestNode({ id: 1, label: "a" }),
      createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
      createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 100 }),
      createTestNode({ id: 4, parentId: 1, label: "locked", x: 200, y: 200, locked: true }),
    ],
    ...extra,
  };
}

function renderNodes(initial: NodeMapState = baseState()) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

describe("useNodes addGroup / removeGroup / selectGroup", () => {
  it("グループを作成し、複数所属を許可する", () => {
    const { result } = renderNodes();
    let first: ReturnType<typeof result.current.addGroup> | undefined;
    let second: ReturnType<typeof result.current.addGroup> | undefined;
    act(() => {
      first = result.current.addGroup([1, 2]);
      second = result.current.addGroup([1, 2, 3]);
    });
    expect(first).toEqual({ ok: true, groupId: expect.any(Number) });
    expect(second).toEqual({ ok: true, groupId: expect.any(Number) });
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups?.[0]?.nodeIds).toEqual([1, 2]);
    expect(result.current.groups?.[1]?.nodeIds).toEqual([1, 2, 3]);
  });

  it("locked メンバーは拒否する", () => {
    const { result } = renderNodes();
    act(() => {
      expect(result.current.addGroup([1, 4])).toEqual({ ok: false, reason: "locked" });
    });
    expect(result.current.groups).toBeUndefined();
  });

  it("メンバー削除で GC する（残2未満で消滅）", () => {
    const { result } = renderNodes(baseState({
      groups: [group({ id: 20, nodeIds: [2, 3], label: "kids" })],
    }));
    act(() => {
      result.current.deleteNode(2);
    });
    expect(result.current.groups).toBeUndefined();
    expect(result.current.nodes.map((n) => n.id)).toEqual([1, 3, 4]);
  });

  it("グループ選択でノード選択をクリアし、Delete 相当の removeGroup がメンバーを残す", () => {
    const { result } = renderNodes(baseState({
      groups: [group({ id: 20, nodeIds: [1, 2] })],
    }));
    act(() => {
      result.current.selectNode(1);
    });
    expect(result.current.selectedNodeId).toBe(1);

    act(() => {
      result.current.selectGroup(20);
    });
    expect(result.current.canvasSelection).toEqual({ type: "group", id: 20 });
    expect(result.current.selectedNodeId).toBeNull();

    act(() => {
      expect(result.current.removeGroup(20)).toEqual({ ok: true });
    });
    expect(result.current.groups).toBeUndefined();
    expect(result.current.nodes.map((n) => n.id)).toEqual([1, 2, 3, 4]);
    expect(result.current.canvasSelection).toEqual({ type: "nodes", ids: [] });
  });

  it("グループ選択中は代表のノード操作が無効（§10）", () => {
    const { result } = renderNodes(baseState({
      groups: [group({ id: 20, nodeIds: [1, 2] })],
    }));
    act(() => {
      result.current.selectGroup(20);
    });

    act(() => {
      expect(result.current.connectNodes(1, 3)).toBe(false);
      expect(result.current.copySubtree(1).ok).toBe(false);
      result.current.updateNodeLabel(1, "changed");
      expect(result.current.changeNodeIndent(2, "indent", new Set([1, 2, 3])).ok).toBe(false);
      expect(result.current.insertParentNode(2, new Set([1, 2, 3])).ok).toBe(false);
      result.current.deleteNode(2);
    });
    expect(result.current.nodes.find((n) => n.id === 1)?.label).toBe("a");
    expect(result.current.nodes.map((n) => n.id)).toEqual([1, 2, 3, 4]);
    expect(result.current.groups).toEqual([group({ id: 20, nodeIds: [1, 2] })]);
  });

  it("ラベル更新と Undo 対象になる", () => {
    const { result } = renderNodes(baseState({
      groups: [group({ id: 20, nodeIds: [1, 2] })],
    }));
    act(() => {
      expect(result.current.updateGroupLabel(20, "題名")).toEqual({ ok: true });
    });
    expect(result.current.groups?.[0]?.label).toBe("題名");
    act(() => {
      expect(result.current.undo()).toBe(true);
    });
    expect(result.current.groups?.[0]?.label).toBe("");
  });

  it("ラベル確定は1履歴（連続入力を1回の updateGroupLabel にまとめたとき Undo 1回で戻る）", () => {
    const { result } = renderNodes(baseState({
      groups: [group({ id: 20, nodeIds: [1, 2], label: "" })],
    }));

    // UI の draft → blur 確定相当: 打鍵ごとの update ではなく最終文字列だけ確定
    act(() => {
      expect(result.current.updateGroupLabel(20, "あいう")).toEqual({ ok: true });
    });
    expect(result.current.groups?.[0]?.label).toBe("あいう");

    act(() => {
      expect(result.current.undo()).toBe(true);
    });
    expect(result.current.groups?.[0]?.label).toBe("");
    expect(result.current.canUndo).toBe(false);
  });
});
