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

  it("同値のcommitは同じhistoryを返す", () => {
    const undone = undoMapHistory(commitMapHistory(createMapHistory(a), b));

    expect(commitMapHistory(undone, { ...a, nodes: a.nodes.map((n) => ({ ...n })) })).toBe(undone);
  });

  it("実変更のcommitはfutureを消す", () => {
    const undone = undoMapHistory(commitMapHistory(createMapHistory(a), b));

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

  it("pastが空でも、グループ内に実変更があればUndoでき、変更がなければUndoできない", () => {
    let h = beginMapHistoryGroup(createMapHistory(a));
    expect(canUndoMapHistory(h)).toBe(false);
    h = previewMapHistory(h, b);
    expect(canUndoMapHistory(h)).toBe(true);
    h = previewMapHistory(h, a);
    expect(canUndoMapHistory(h)).toBe(false);
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
      ["links", { links: ["https://example.com/"] }],
      ["tags", { tags: ["重要"] }],
      ["sources", { sources: [{ title: "設計" }] }],
      ["mapLinks", { mapLinks: [{ targetMapId: "map-b", targetNodeId: 2 }] }],
    ])("%sの違いを検出する", (_name, override) => {
      expect(areMapStatesEqual(make({}), make(override))).toBe(false);
    });

    const n1 = createTestNode({ id: 1 });
    const n2 = createTestNode({ id: 2 });

    it.each<[string, NodeMapState, NodeMapState]>([
      ["配列順序", { layoutMode: "manual", nodes: [n1, n2] }, { layoutMode: "manual", nodes: [n2, n1] }],
      ["layoutMode", { layoutMode: "manual", nodes: [n1] }, { layoutMode: "auto", nodes: [n1] }],
      ["ノード数", { layoutMode: "manual", nodes: [n1] }, { layoutMode: "manual", nodes: [n1, n2] }],
    ])("%sの違いを検出する", (_name, left, right) => {
      expect(areMapStatesEqual(left, right)).toBe(false);
    });

    it("同内容なら参照が違っても等しい", () => {
      expect(areMapStatesEqual(make({}), make({}))).toBe(true);
    });

    describe("配列の値（links）", () => {
      const A = "https://example.com/a";
      const B = "https://example.org/b";
      const withLinks = (links: readonly string[]): NodeMapState => ({
        layoutMode: "manual",
        nodes: [createTestNode({ id: 1, links })],
      });

      it("内容が同じなら別の配列でも等しく、確定しても履歴を積まない（L-135）", () => {
        expect(areMapStatesEqual(withLinks([A, B]), withLinks([A, B]))).toBe(true);

        const committed = commitMapHistory(createMapHistory(withLinks([A])), withLinks([A]));
        expect(committed.past).toHaveLength(0);
      });

      it.each<[string, readonly string[], readonly string[]]>([
        ["要素が違う", [A], [B]],
        ["順が違う", [A, B], [B, A]],
        ["長さが違う", [A], [A, B]],
      ])("%s なら等しくない", (_name, left, right) => {
        expect(areMapStatesEqual(withLinks(left), withLinks(right))).toBe(false);
      });
    });

    describe("配列の値（tags）", () => {
      const withTags = (tags: readonly string[]): NodeMapState => ({
        layoutMode: "manual",
        nodes: [createTestNode({ id: 1, tags })],
      });

      it("内容が同じなら別の配列でも等しく、確定しても履歴を積まない（L-135）", () => {
        expect(areMapStatesEqual(withTags(["Python", "重要"]), withTags(["Python", "重要"]))).toBe(true);

        const committed = commitMapHistory(createMapHistory(withTags(["重要"])), withTags(["重要"]));
        expect(committed.past).toHaveLength(0);
      });

      it.each<[string, readonly string[], readonly string[]]>([
        ["表記が違う", ["Python"], ["python"]],
        ["順が違う", ["Python", "重要"], ["重要", "Python"]],
        ["長さが違う", ["Python"], ["Python", "重要"]],
      ])("%s なら等しくない", (_name, left, right) => {
        expect(areMapStatesEqual(withTags(left), withTags(right))).toBe(false);
      });
    });

    describe("配列の値（sources）", () => {
      const withSources = (
        sources: readonly { title: string; page?: string; url?: string }[] | undefined,
      ): NodeMapState => ({
        layoutMode: "manual",
        nodes: [createTestNode({ id: 1, ...(sources === undefined ? {} : { sources }) })],
      });

      it("内容が同じなら別の配列・別オブジェクトでも等しく、確定しても履歴を積まない（L-135）", () => {
        expect(
          areMapStatesEqual(
            withSources([{ title: "設計", page: "12" }]),
            withSources([{ title: "設計", page: "12" }]),
          ),
        ).toBe(true);

        const committed = commitMapHistory(
          createMapHistory(withSources([{ title: "設計" }])),
          withSources([{ title: "設計" }]),
        );
        expect(committed.past).toHaveLength(0);
      });

      it("未定義と空配列は等しい", () => {
        expect(areMapStatesEqual(withSources(undefined), withSources([]))).toBe(true);
      });

      it.each<[string, readonly { title: string; page?: string; url?: string }[], readonly { title: string; page?: string; url?: string }[]]>([
        ["表記が違う", [{ title: "Python" }], [{ title: "python" }]],
        ["ページが違う", [{ title: "設計", page: "1" }], [{ title: "設計", page: "2" }]],
        ["順が違う", [{ title: "A" }, { title: "B" }], [{ title: "B" }, { title: "A" }]],
        ["長さが違う", [{ title: "A" }], [{ title: "A" }, { title: "B" }]],
      ])("%s なら等しくない", (_name, left, right) => {
        expect(areMapStatesEqual(withSources(left), withSources(right))).toBe(false);
      });
    });

    describe("配列の値（mapLinks）", () => {
      type MapLinkInput = { targetMapId: string; targetNodeId?: number };
      const withMapLinks = (mapLinks: readonly MapLinkInput[] | undefined): NodeMapState => ({
        layoutMode: "manual",
        nodes: [createTestNode({ id: 1, ...(mapLinks === undefined ? {} : { mapLinks }) })],
      });

      it("内容が同じなら別の配列・別オブジェクトでも等しく、確定しても履歴を積まない（L-135）", () => {
        expect(
          areMapStatesEqual(
            withMapLinks([{ targetMapId: "map-b", targetNodeId: 2 }, { targetMapId: "map-c" }]),
            withMapLinks([{ targetMapId: "map-b", targetNodeId: 2 }, { targetMapId: "map-c" }]),
          ),
        ).toBe(true);

        const committed = commitMapHistory(
          createMapHistory(withMapLinks([{ targetMapId: "map-b", targetNodeId: 2 }])),
          withMapLinks([{ targetMapId: "map-b", targetNodeId: 2 }]),
        );
        expect(committed.past).toHaveLength(0);
      });

      it("未定義と空配列は等しい", () => {
        expect(areMapStatesEqual(withMapLinks(undefined), withMapLinks([]))).toBe(true);
      });

      it.each<[string, readonly MapLinkInput[], readonly MapLinkInput[]]>([
        ["マップが違う", [{ targetMapId: "map-b" }], [{ targetMapId: "map-c" }]],
        ["ノードが違う", [{ targetMapId: "map-b", targetNodeId: 1 }], [{ targetMapId: "map-b", targetNodeId: 2 }]],
        ["ノード指定の有無が違う", [{ targetMapId: "map-b" }], [{ targetMapId: "map-b", targetNodeId: 1 }]],
        ["順が違う", [{ targetMapId: "map-b" }, { targetMapId: "map-c" }], [{ targetMapId: "map-c" }, { targetMapId: "map-b" }]],
        ["長さが違う", [{ targetMapId: "map-b" }], [{ targetMapId: "map-b" }, { targetMapId: "map-c" }]],
      ])("%s なら等しくなく、確定すると履歴を積む", (_name, left, right) => {
        expect(areMapStatesEqual(withMapLinks(left), withMapLinks(right))).toBe(false);

        const committed = commitMapHistory(createMapHistory(withMapLinks(left)), withMapLinks(right));
        expect(committed.past).toHaveLength(1);
      });
    });
  });
});
