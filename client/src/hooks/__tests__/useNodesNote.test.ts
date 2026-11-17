import { act, renderHook } from "@testing-library/react";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

// 1: 根、2: メモあり、3: メモなし。ラベルは全ノードで変える（L-168）
function initialMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "メモあり", x: 220, note: "元のメモ" }),
      createTestNode({ id: 3, parentId: 1, label: "メモなし", x: 220, y: 100 }),
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

describe("useNodes の previewNodeNote", () => {
  it("グループ外では 1 回の履歴として確定し、1 回の Undo で戻る。documentRevision は変えない", () => {
    const { result } = renderNodes();
    const revision = result.current.documentRevision;
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(3, "新しいメモ"); });

    expect(accepted).toBe(true);
    expect(nodeOf(result.current, 3).note).toBe("新しいメモ");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);

    act(() => { result.current.undo(); });
    expect("note" in nodeOf(result.current, 3)).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("履歴グループ（beginMoveHistory）の中では履歴に積まず、終了で 1 回の履歴にまとまる", () => {
    const { result } = renderNodes();

    act(() => {
      const lease = result.current.beginMoveHistory();
      result.current.previewNodeNote(2, "途中");
      result.current.previewNodeNote(2, "途中の続き");
      result.current.previewNodeNote(2, "最終");
      lease.finish();
    });

    expect(nodeOf(result.current, 2).note).toBe("最終");
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).note).toBe("元のメモ");
    expect(result.current.canUndo).toBe(false);
  });

  it("グループが他の操作で閉じた後の反映は、1 回の履歴として確定する（正しさは保つ）", () => {
    const { result } = renderNodes();

    act(() => {
      const lease = result.current.beginMoveHistory();
      result.current.previewNodeNote(2, "A");
      // 別の操作がグループを始めて閉じる。最初の lease は失効する
      result.current.beginMoveHistory().finish();
      expect(lease.isActive()).toBe(false);
      result.current.previewNodeNote(2, "B");
    });

    expect(nodeOf(result.current, 2).note).toBe("B");
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).note).toBe("A");
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).note).toBe("元のメモ");
  });

  it("空白だけにすると、メモの項目ごと外す", () => {
    const { result } = renderNodes();

    act(() => { result.current.previewNodeNote(2, " \n "); });

    expect("note" in nodeOf(result.current, 2)).toBe(false);
  });

  it("ちょうど上限のメモは受理する", () => {
    const { result } = renderNodes();
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(3, "a".repeat(NODE_NOTE_MAX_LENGTH)); });

    expect(accepted).toBe(true);
    expect(nodeOf(result.current, 3).note).toHaveLength(NODE_NOTE_MAX_LENGTH);
  });

  it.each<[string, number, string]>([
    ["同じ値", 2, "元のメモ"],
    ["メモの無いノードを空白だけにする", 3, "   "],
    ["対象が無い", 99, "メモ"],
    ["上限を 1 超える", 3, "a".repeat(NODE_NOTE_MAX_LENGTH + 1)],
  ])("%s ときは false を返し、何も変えず履歴も積まない（L-135）", (_name, id, note) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(id, note); });

    expect(accepted).toBe(false);
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("自動配置でも更新できる", () => {
    const { result } = renderNodes(initialMap("auto"));
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(3, "自動配置のメモ"); });

    expect(accepted).toBe(true);
    expect(nodeOf(result.current, 3).note).toBe("自動配置のメモ");
  });

  it("関数参照は更新後も安定している", () => {
    const { result } = renderNodes();
    const { previewNodeNote } = result.current;

    act(() => { result.current.previewNodeNote(3, "メモ"); });

    expect(result.current.previewNodeNote).toBe(previewNodeNote);
  });
});
