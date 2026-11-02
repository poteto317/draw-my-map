import { act, renderHook } from "@testing-library/react";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { deleteNodeOnly } from "@/domain/nodes/nodeOnlyDeletion";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";
const node = (id: number, parentId: number | null = null): Node => createTestNode({ id, parentId, label: `ノード${id}`, x: id * 21, y: id * 17 });
const ALL = new Set([1, 6, 2, 8, 4, 3, 7, 5, 9]);
function map(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return { layoutMode, nodes: [node(1), { ...node(6, 4), importance: "high", illustration: createJpegDataUrl(100, 100), height: 240 }, node(2, 1), node(8, 2), node(4, 1), node(3, 1), node(7, 6), node(5, 4), node(9)] };
}
function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}
describe("useNodes のノードだけ削除", () => {
  it.each(["manual", "auto"] as const)("%sで成功し対象だけ選択解除、全属性を保持", (mode) => {
    for (const selected of [4, 6, 9]) {
      const { result, unmount } = renderNodes(map(mode));
      act(() => result.current.selectNode(selected));
      const before = result.current;
      const candidate = deleteNodeOnly(before.nodes, 4, ALL, mode);
      expect(candidate.ok).toBe(true);
      if (!candidate.ok)
        throw new Error(candidate.reason);
      act(() => expect(result.current.deleteNodeOnly(4, ALL)).toEqual({ ok: true, deletedId: 4 }));
      expect(result.current.nodes).toEqual(mode === "auto" ? layoutNodeForest(candidate.nodes) : candidate.nodes);
      expect(result.current.selectedNodeId).toBe(selected === 4 ? null : selected);
      expect(result.current.documentRevision).toBe(before.documentRevision);
      unmount();
    }
  });
  it.each(["manual", "auto"] as const)("%sでUndo/Redoが全順序・全属性・座標を1回で復元", (mode) => {
    const { result } = renderNodes(map(mode));
    const before = result.current.nodes;
    const revision = result.current.documentRevision;
    act(() => { result.current.deleteNodeOnly(4, ALL); });
    const deleted = result.current.nodes;
    act(() => { result.current.selectNode(6); expect(result.current.undo()).toBe(true); });
    expect(result.current.nodes).toEqual(before);
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.documentRevision).toBe(revision + 1);
    act(() => { result.current.selectNode(6); expect(result.current.redo()).toBe(true); });
    expect(result.current.nodes).toEqual(deleted);
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.documentRevision).toBe(revision + 2);
    act(() => { expect(result.current.undo()).toBe(true); });
    act(() => { expect(result.current.undo()).toBe(false); });
  });
  it("初回callbackの参照を維持し同じactの最新全ノードとmodeを使う", () => {
    const { result, rerender } = renderNodes(map());
    const remove = result.current.deleteNodeOnly;
    rerender();
    expect(result.current.deleteNodeOnly).toBe(remove);
    let added!: number;
    act(() => {
      added = result.current.addChildNode(4)!;
      result.current.updateNodeLabel(6, "最新のラベル");
      result.current.setLayoutMode("auto");
      expect(remove(4, new Set([...ALL, added]))).toEqual({ ok: true, deletedId: 4 });
    });
    const changed = result.current.nodes;
    expect(changed.find(n => n.id === added)?.parentId).toBe(1);
    expect(changed.find(n => n.id === 6)?.label).toBe("最新のラベル");
    expect(result.current.layoutMode).toBe("auto");
    expect(changed).toEqual(layoutNodeForest(changed));
    expect(result.current.deleteNodeOnly).toBe(remove);
  });
  const failures: [
    string,
    NodeMapState,
    number,
    ReadonlySet<number>,
    string
  ][] = [
    ["不在", map("auto"), 99, ALL, "node-missing"],
    ["非表示", map("auto"), 4, new Set([1]), "node-hidden"],
    ["ID重複", { layoutMode: "manual", nodes: [node(1), node(4), node(4)] }, 4, ALL, "invalid-structure"],
    ["親欠け", { layoutMode: "manual", nodes: [node(1), node(4, 99)] }, 4, ALL, "invalid-structure"],
    ["自己参照", { layoutMode: "manual", nodes: [node(1), node(4, 4)] }, 4, ALL, "invalid-structure"],
    ["循環", { layoutMode: "manual", nodes: [node(1), node(4, 6), node(6, 7), node(7, 4)] }, 4, ALL, "invalid-structure"],
    ["非有限ID", { layoutMode: "manual", nodes: [node(1), node(4), { ...node(9), id: Infinity }] }, 4, ALL, "invalid-structure"],
    ...(["x", "y", "width", "height"] as const).flatMap(key => [NaN, Infinity].map((value): [
      string,
      NodeMapState,
      number,
      ReadonlySet<number>,
      string
    ] => [key + value, { layoutMode: "manual", nodes: [node(1), { ...node(4), [key]: value }] }, 4, ALL, "placement-failed"])),
    ...(["width", "height"] as const).flatMap(key => [0, -1].map((value): [
      string,
      NodeMapState,
      number,
      ReadonlySet<number>,
      string
    ] => [key + value, { layoutMode: "manual", nodes: [node(1), { ...node(4), [key]: value }] }, 4, ALL, "placement-failed"])),
  ];
  it.each(failures)("%sの失敗で選択・参照・履歴・Redo・版を保持", (_, initial, id, visible, reason) => {
    const { result } = renderNodes(initial);
    act(() => result.current.updateNodeLabel(1, "変更"));
    act(() => { expect(result.current.undo()).toBe(true); });
    act(() => result.current.selectNode(4));
    const before = result.current;
    act(() => expect(result.current.deleteNodeOnly(id, visible)).toEqual({ ok: false, reason }));
    expect(result.current.nodes).toBe(before.nodes);
    expect(result.current.selectedNodeId).toBe(4);
    expect(result.current.canUndo).toBe(before.canUndo);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.documentRevision).toBe(before.documentRevision);
    act(() => { expect(result.current.redo()).toBe(true); });
    expect(result.current.nodes.find(n => n.id === 1)?.label).toBe("変更");
  });
  it("候補成功後の実自動配置失敗も原子的", () => {
    const initial: NodeMapState = { layoutMode: "auto", nodes: [{ ...node(1), x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE }, node(6, 1), node(4)] };
    const candidate = deleteNodeOnly(initial.nodes, 4, ALL, "auto");
    expect(candidate.ok).toBe(true);
    if (!candidate.ok)
      throw new Error(candidate.reason);
    expect(layoutNodeForest(candidate.nodes)).toBeNull();
    const { result } = renderNodes(initial);
    act(() => result.current.updateNodeLabel(1, "変更"));
    act(() => { result.current.undo(); });
    act(() => result.current.selectNode(4));
    const before = result.current;
    act(() => expect(result.current.deleteNodeOnly(4, ALL)).toEqual({ ok: false, reason: "placement-failed" }));
    expect(result.current.nodes).toBe(before.nodes);
    expect(result.current.selectedNodeId).toBe(4);
    expect(result.current.canUndo).toBe(before.canUndo);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.documentRevision).toBe(before.documentRevision);
    act(() => { expect(result.current.redo()).toBe(true); });
    expect(result.current.nodes.find(n => n.id === 1)?.label).toBe("変更");
  });
  it("従来のdeleteNodeは子孫を含めて削除", () => {
    const { result } = renderNodes(map());
    act(() => result.current.deleteNode(4));
    expect(result.current.nodes.map(n => n.id)).toEqual([1, 2, 8, 3, 9]);
  });
});
