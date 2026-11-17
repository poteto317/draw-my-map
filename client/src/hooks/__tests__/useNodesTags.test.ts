import { act, renderHook } from "@testing-library/react";
import {
  NODE_TAGS_MAX_COUNT,
  type AddNodeTagFailureReason,
  type AddNodeTagOutcome,
} from "@/domain/nodes/nodeTag";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

// タグ名を count 件（tag0 …）
function tagsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tag${index}`);
}

// 1: 根、2: タグあり、3: タグなし。ラベルは全ノードで変える（L-168）
function initialMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "タグあり", x: 220, tags: ["Python"] }),
      createTestNode({ id: 3, parentId: 1, label: "タグなし", x: 220, y: 100 }),
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

describe("useNodes の addNodeTag", () => {
  it("まとめた名前を末尾に足して { ok: true } を返し、1 回の履歴として確定する。1 回の Undo で戻り、documentRevision は変えない", () => {
    const { result } = renderNodes();
    const revision = result.current.documentRevision;
    let outcome!: AddNodeTagOutcome;

    act(() => { outcome = result.current.addNodeTag(2, "  機械\t学習 "); });

    expect(outcome).toEqual({ ok: true });
    expect(nodeOf(result.current, 2).tags).toEqual(["Python", "機械 学習"]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);

    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).tags).toEqual(["Python"]);
    expect(result.current.canUndo).toBe(false);
  });

  it("タグの無いノードにも追加できる", () => {
    const { result } = renderNodes();

    act(() => { result.current.addNodeTag(3, "重要"); });

    expect(nodeOf(result.current, 3).tags).toEqual(["重要"]);
  });

  it.each<[string, number, string, AddNodeTagFailureReason]>([
    ["対象が無い", 99, "重要", "node-missing"],
    ["空白だけ", 3, "   ", "empty"],
    ["使えない文字", 3, "a\u0000b", "invalid"],
    ["長すぎる", 3, "a".repeat(31), "too-long"],
    ["表記違いの同じタグがすでにある", 2, "PYTHON", "duplicate"],
  ])("%s ときは理由を返し、何も変えず履歴も積まない（L-135）", (_name, id, input, reason) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let outcome!: AddNodeTagOutcome;

    act(() => { outcome = result.current.addNodeTag(id, input); });

    expect(outcome).toEqual({ ok: false, reason });
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("10 件あるノードへの追加は too-many で、何も変えない", () => {
    const full: NodeMapState = {
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "上限", tags: tagsOf(NODE_TAGS_MAX_COUNT) })],
    };
    const { result } = renderNodes(full);
    const before = result.current.nodes;
    let outcome!: AddNodeTagOutcome;

    act(() => { outcome = result.current.addNodeTag(1, "重要"); });

    expect(outcome).toEqual({ ok: false, reason: "too-many" });
    expect(result.current.nodes).toBe(before);
  });

  it("同じイベントの中の連続 2 回の追加は、最新の状態から判定して両方とも入り、2 回の履歴になる（L-453）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeTagOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeTag(3, "重要"));
      outcomes.push(result.current.addNodeTag(3, "資料あり"));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: true }]);
    expect(nodeOf(result.current, 3).tags).toEqual(["重要", "資料あり"]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 3).tags).toEqual(["重要"]);
  });

  it("同じイベントの中で表記違いの同じタグを 2 回追加すると、2 回目は duplicate（古い状態で判定しない）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeTagOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeTag(3, "Rust"));
      outcomes.push(result.current.addNodeTag(3, "rust"));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: false, reason: "duplicate" }]);
    expect(nodeOf(result.current, 3).tags).toEqual(["Rust"]);
  });

  it("自動配置でも追加でき、座標は変えない", () => {
    const { result } = renderNodes(initialMap("auto"));
    const before = nodeOf(result.current, 3);

    act(() => { result.current.addNodeTag(3, "重要"); });

    expect(nodeOf(result.current, 3)).toEqual({ ...before, tags: ["重要"] });
  });

  it("関数参照は更新後も安定している", () => {
    const { result } = renderNodes();
    const { addNodeTag, removeNodeTag } = result.current;

    act(() => { result.current.addNodeTag(3, "重要"); });

    expect(result.current.addNodeTag).toBe(addNodeTag);
    expect(result.current.removeNodeTag).toBe(removeNodeTag);
  });
});

describe("useNodes の removeNodeTag", () => {
  it("指定のタグだけを消して true を返し、1 回の Undo で戻る", () => {
    const twoTags: NodeMapState = {
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "2件", tags: ["Python", "重要"] })],
    };
    const { result } = renderNodes(twoTags);
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeTag(1, "Python"); });

    expect(removed).toBe(true);
    expect(nodeOf(result.current, 1).tags).toEqual(["重要"]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 1).tags).toEqual(["Python", "重要"]);
  });

  it("最後の 1 件を消すと tags のキーごと外す", () => {
    const { result } = renderNodes();

    act(() => { result.current.removeNodeTag(2, "Python"); });

    expect("tags" in nodeOf(result.current, 2)).toBe(false);
  });

  it.each<[string, number, string]>([
    ["対象が無い", 99, "Python"],
    ["そのタグを持たない", 2, "重要"],
    ["表記違い（保存した名前と完全に一致しない）", 2, "python"],
  ])("%s ときは false を返し、何も変えず履歴も積まない", (_name, id, tag) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeTag(id, tag); });

    expect(removed).toBe(false);
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });
});
