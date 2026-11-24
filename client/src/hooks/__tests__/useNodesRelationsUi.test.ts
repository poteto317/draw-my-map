import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { MapRelation } from "@/types/mapRelation";
import type { NodeMapState } from "@/types/nodeMapState";

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return { kind: "related", directed: false, ...partial };
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

describe("useNodes addRelation / removeRelation / canvasSelection", () => {
  it("関連線を追加し、既定は related・無向", () => {
    const { result } = renderNodes();
    let outcome: ReturnType<typeof result.current.addRelation> | undefined;
    act(() => {
      outcome = result.current.addRelation(1, 2);
    });
    expect(outcome).toEqual({ ok: true, relationId: expect.any(Number) });
    expect(result.current.relations).toEqual([
      relation({ id: outcome!.ok ? outcome!.relationId : -1, fromId: 1, toId: 2 }),
    ]);
  });

  it("重複・locked は拒否する", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));
    act(() => {
      expect(result.current.addRelation(2, 1)).toEqual({ ok: false, reason: "duplicate" });
      expect(result.current.addRelation(1, 4)).toEqual({ ok: false, reason: "locked" });
    });
    expect(result.current.relations).toHaveLength(1);
  });

  it("関連線選択でノード選択をクリアし、Delete 相当の removeRelation が効く", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));
    act(() => {
      result.current.selectNode(1);
    });
    expect(result.current.selectedNodeId).toBe(1);

    act(() => {
      result.current.selectRelation(10);
    });
    expect(result.current.canvasSelection).toEqual({ type: "relation", id: 10 });
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.selectedNodeIds).toEqual([]);

    act(() => {
      expect(result.current.removeRelation(10)).toEqual({ ok: true });
    });
    expect(result.current.relations).toBeUndefined();
    expect(result.current.canvasSelection).toEqual({ type: "nodes", ids: [] });
  });

  it("関連線選択中は代表のノード操作が無効（§10）", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));
    act(() => {
      result.current.selectRelation(10);
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
    expect(result.current.relations).toEqual([relation({ id: 10, fromId: 1, toId: 2 })]);
  });

  it("ノードを選ぶと関連線選択が解除される", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));
    act(() => {
      result.current.selectRelation(10);
      result.current.selectNode(2);
    });
    expect(result.current.canvasSelection).toEqual({ type: "nodes", ids: [2] });
    expect(result.current.selectedNodeId).toBe(2);
  });

  it("関連線選択を clearNonNodeSelection すると insertForest（outline.add-root 相当）が通る", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));
    const beforeCount = result.current.nodes.length;

    act(() => {
      result.current.selectRelation(10);
    });
    expect(result.current.canvasSelection).toEqual({ type: "relation", id: 10 });

    let blocked: ReturnType<typeof result.current.insertForest> | undefined;
    act(() => {
      blocked = result.current.insertForest(
        [{ label: "新ルート", parentIndex: null }],
        { kind: "root" },
      );
    });
    expect(blocked).toEqual({ ok: false, reason: "placement-failed" });
    expect(result.current.nodes).toHaveLength(beforeCount);

    act(() => {
      result.current.clearNonNodeSelection();
    });
    expect(result.current.canvasSelection).toEqual({ type: "nodes", ids: [] });

    let inserted: ReturnType<typeof result.current.insertForest> | undefined;
    act(() => {
      inserted = result.current.insertForest(
        [{ label: "新ルート", parentIndex: null }],
        { kind: "root" },
      );
    });
    expect(inserted?.ok).toBe(true);
    expect(result.current.nodes).toHaveLength(beforeCount + 1);
    expect(result.current.nodes.some((node) => node.label === "新ルート")).toBe(true);
  });
});
