import {
  MAP_HISTORY_LIMIT,
  areMapStatesEqual,
  beginMapHistoryGroup,
  canRedoMapHistory,
  canUndoMapHistory,
  commitMapHistory,
  createMapHistory,
  finishMapHistoryGroup,
  previewMapHistory,
  redoMapHistory,
  undoMapHistory,
} from "@/domain/history/mapHistory";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";

function state(label: string, x = 0): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [createTestNode({ id: 1, label, x }), createTestNode({ id: 2, label: "other" })],
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const a = state("a");
const b = state("b");
const c = state("c");

describe("mapHistory", () => {
  it("commitでUndo/Redoできる", () => {
    const h = commitMapHistory(createMapHistory(a), b);

    expect(undoMapHistory(h).present).toEqual(a);
    expect(redoMapHistory(undoMapHistory(h)).present).toEqual(b);
    expect(canUndoMapHistory(h)).toBe(true);
    expect(canRedoMapHistory(h)).toBe(false);
  });

  it("同値のcommitは同じhistoryを返し、実変更はfutureを消す", () => {
    const undone = undoMapHistory(commitMapHistory(createMapHistory(a), b));

    expect(commitMapHistory(undone, { ...a, nodes: a.nodes.map((n) => ({ ...n })) })).toBe(undone);
    expect(commitMapHistory(undone, c).future).toEqual([]);
  });

  it("空履歴のUndo/Redoは同じhistoryを返す", () => {
    const h = createMapHistory(a);

    expect(undoMapHistory(h)).toBe(h);
    expect(redoMapHistory(h)).toBe(h);
  });

  it("101回の変更でpastは100件に制限される", () => {
    let h = createMapHistory(state("s", 0));
    for (let i = 1; i <= MAP_HISTORY_LIMIT + 1; i += 1) h = commitMapHistory(h, state("s", i));
    expect(h.past).toHaveLength(MAP_HISTORY_LIMIT);

    let undoCount = 0;
    while (canUndoMapHistory(h)) {
      h = undoMapHistory(h);
      undoCount += 1;
    }
    expect(undoCount).toBe(MAP_HISTORY_LIMIT);
    expect(h.present).toEqual(state("s", 1));
    expect(undoMapHistory(h)).toBe(h);

    while (canRedoMapHistory(h)) h = redoMapHistory(h);
    expect(h.present).toEqual(state("s", MAP_HISTORY_LIMIT + 1));
    expect(h.future).toEqual([]);
  });

  it("グループ内のb->cは終了後に1件だけpastへ入る", () => {
    let h = beginMapHistoryGroup(commitMapHistory(createMapHistory(a), b));
    h = previewMapHistory(h, c);
    expect(h.past).toHaveLength(1);
    expect(canUndoMapHistory(h)).toBe(true);
    h = finishMapHistoryGroup(h);

    expect(h.past).toEqual([a, b]);
    expect(h.present).toEqual(c);
    expect(h.groupStart).toBeNull();
  });

  it("グループ内で元に戻ればpast/futureを維持する", () => {
    const undone = undoMapHistory(commitMapHistory(createMapHistory(a), b));
    let h = beginMapHistoryGroup(undone);
    h = previewMapHistory(h, c);
    expect(canRedoMapHistory(h)).toBe(false);
    h = finishMapHistoryGroup(previewMapHistory(h, a));

    expect(h.past).toEqual(undone.past);
    expect(h.future).toEqual(undone.future);
    expect(h.groupStart).toBeNull();
    expect(canRedoMapHistory(h)).toBe(true);
  });

  it("グループなしのpreviewは単独編集になる", () => {
    const h = previewMapHistory(createMapHistory(a), b);

    expect(h.past).toEqual([a]);
    expect(previewMapHistory(h, b)).toBe(h);
  });

  it("進行中グループのUndo/Redoは先に終了処理する", () => {
    const base = commitMapHistory(createMapHistory(a), b);
    const grouped = previewMapHistory(beginMapHistoryGroup(base), c);

    const undone = undoMapHistory(grouped);
    expect(undone.present).toEqual(b);
    expect(undone.future).toEqual([c]);
    expect(undone.groupStart).toBeNull();
    expect(redoMapHistory(previewMapHistory(beginMapHistoryGroup(base), c)).present).toEqual(c);
  });

  it("commitは進行中グループを閉じてから単独編集する", () => {
    const grouped = previewMapHistory(beginMapHistoryGroup(createMapHistory(a)), b);
    const h = commitMapHistory(grouped, c);

    expect(h.past).toEqual([a, b]);
    expect(h.groupStart).toBeNull();
  });

  it("入力を変更せず、変更していないNode参照を共有する", () => {
    const input = deepFreeze(state("a"));
    const next = { ...input, nodes: [{ ...input.nodes[0], x: 5 }, input.nodes[1]] };
    const h = commitMapHistory(createMapHistory(input), next);

    expect(h.past[0]).toBe(input);
    expect(h.present.nodes[1]).toBe(input.nodes[1]);
  });

  describe("areMapStatesEqual", () => {
    const base = createTestNode({ id: 1 });
    const make = (node: Partial<typeof base>): NodeMapState => ({
      layoutMode: "manual",
      nodes: [{ ...base, ...node }],
    });

    it.each([
      ["id", { id: 9 }],
      ["parentId", { parentId: 3 }],
      ["x", { x: 1 }],
      ["y", { y: 1 }],
      ["width", { width: 1 }],
      ["height", { height: 1 }],
      ["label", { label: "z" }],
      ["importance", { importance: "high" as const }],
      ["illustration", { illustration: "data:x" }],
    ])("%sの違いを検出する", (_name, override) => {
      expect(areMapStatesEqual(make({}), make(override))).toBe(false);
    });

    it("配列順序とlayoutModeの違いを検出する", () => {
      const n1 = createTestNode({ id: 1 });
      const n2 = createTestNode({ id: 2 });
      expect(
        areMapStatesEqual({ layoutMode: "manual", nodes: [n1, n2] }, { layoutMode: "manual", nodes: [n2, n1] }),
      ).toBe(false);
      expect(
        areMapStatesEqual({ layoutMode: "manual", nodes: [n1] }, { layoutMode: "auto", nodes: [n1] }),
      ).toBe(false);
      expect(
        areMapStatesEqual({ layoutMode: "manual", nodes: [n1] }, { layoutMode: "manual", nodes: [n1, n2] }),
      ).toBe(false);
    });

    it("同内容なら参照が違っても等しい", () => {
      expect(areMapStatesEqual(make({}), make({}))).toBe(true);
    });
  });
});
