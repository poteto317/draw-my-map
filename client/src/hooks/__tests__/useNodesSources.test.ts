import { act, renderHook } from "@testing-library/react";
import {
  NODE_SOURCES_MAX_COUNT,
  type AddNodeSourceFailureReason,
  type AddNodeSourceOutcome,
  type NodeSource,
  type NodeSourceInput,
} from "@/domain/nodes/nodeSource";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

const A_URL = "https://example.com/a";
const B_URL = "https://example.org/b";

function source(title: string, page?: string, url?: string): NodeSource {
  return {
    title,
    ...(page !== undefined ? { page } : {}),
    ...(url !== undefined ? { url } : {}),
  };
}

function sourcesOf(count: number): NodeSource[] {
  return Array.from({ length: count }, (_, index) => source(`book${index}`));
}

// 1: 根、2: 出典あり、3: 出典なし。ラベルは全ノードで変える（L-168）
function initialMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({
        id: 2,
        parentId: 1,
        label: "出典あり",
        x: 220,
        sources: [source("設計入門", "12", A_URL)],
      }),
      createTestNode({ id: 3, parentId: 1, label: "出典なし", x: 220, y: 100 }),
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

describe("useNodes の addNodeSource", () => {
  it("正規化した出典を末尾に足して { ok: true } を返し、1 回の履歴として確定する。1 回の Undo で戻り、documentRevision は変えない", () => {
    const { result } = renderNodes();
    const revision = result.current.documentRevision;
    let outcome!: AddNodeSourceOutcome;

    act(() => {
      outcome = result.current.addNodeSource(2, {
        title: "  実装  ",
        page: "  3  ",
        url: " HTTPS://Example.org/b ",
      });
    });

    expect(outcome).toEqual({ ok: true });
    expect(nodeOf(result.current, 2).sources).toEqual([
      source("設計入門", "12", A_URL),
      source("実装", "3", B_URL),
    ]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);

    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).sources).toEqual([source("設計入門", "12", A_URL)]);
    expect(result.current.canUndo).toBe(false);
  });

  it("出典の無いノードにも追加できる", () => {
    const { result } = renderNodes();

    act(() => { result.current.addNodeSource(3, { title: "設計" }); });

    expect(nodeOf(result.current, 3).sources).toEqual([source("設計")]);
  });

  it.each<[string, number, NodeSourceInput, AddNodeSourceFailureReason]>([
    ["対象が無い", 99, { title: "設計" }, "node-missing"],
    ["タイトルが空白だけ", 3, { title: "   " }, "empty-title"],
    ["タイトルに使えない文字", 3, { title: "a\u0000b" }, "invalid-title"],
    ["タイトルが長すぎる", 3, { title: "a".repeat(201) }, "too-long-title"],
    ["ページに使えない文字", 3, { title: "設計", page: "a\u0000b" }, "invalid-page"],
    ["URL が javascript:", 3, { title: "設計", url: "javascript:alert(1)" }, "unsupported-scheme"],
    ["同じ鍵の出典がすでにある", 2, { title: "設計入門", page: "12", url: A_URL }, "duplicate"],
  ])("%s ときは理由を返し、何も変えず履歴も積まない（L-135）", (_name, id, input, reason) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let outcome!: AddNodeSourceOutcome;

    act(() => { outcome = result.current.addNodeSource(id, input); });

    expect(outcome).toEqual({ ok: false, reason });
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("10 件あるノードへの追加は too-many で、何も変えない", () => {
    const full: NodeMapState = {
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "上限", sources: sourcesOf(NODE_SOURCES_MAX_COUNT) })],
    };
    const { result } = renderNodes(full);
    const before = result.current.nodes;
    let outcome!: AddNodeSourceOutcome;

    act(() => { outcome = result.current.addNodeSource(1, { title: "追加" }); });

    expect(outcome).toEqual({ ok: false, reason: "too-many" });
    expect(result.current.nodes).toBe(before);
  });

  it("同じイベントの中の連続 2 回の追加は、最新の状態から判定して両方とも入り、2 回の履歴になる（L-453）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeSourceOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeSource(3, { title: "設計" }));
      outcomes.push(result.current.addNodeSource(3, { title: "実装" }));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: true }]);
    expect(nodeOf(result.current, 3).sources).toEqual([source("設計"), source("実装")]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 3).sources).toEqual([source("設計")]);
  });

  it("同じイベントの中で同じ鍵の出典を 2 回追加すると、2 回目は duplicate（古い状態で判定しない）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeSourceOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeSource(3, { title: "Rust" }));
      outcomes.push(result.current.addNodeSource(3, { title: "rust" }));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: false, reason: "duplicate" }]);
    expect(nodeOf(result.current, 3).sources).toEqual([source("Rust")]);
  });

  it("自動配置でも追加でき、座標は変えない", () => {
    const { result } = renderNodes(initialMap("auto"));
    const before = nodeOf(result.current, 3);

    act(() => { result.current.addNodeSource(3, { title: "設計" }); });

    expect(nodeOf(result.current, 3)).toEqual({ ...before, sources: [source("設計")] });
  });

  it("関数参照は更新後も安定している", () => {
    const { result } = renderNodes();
    const { addNodeSource, removeNodeSource } = result.current;

    act(() => { result.current.addNodeSource(3, { title: "設計" }); });

    expect(result.current.addNodeSource).toBe(addNodeSource);
    expect(result.current.removeNodeSource).toBe(removeNodeSource);
  });
});

describe("useNodes の removeNodeSource", () => {
  it("指定 index の出典だけを消して true を返し、1 回の Undo で戻る", () => {
    const twoSources: NodeMapState = {
      layoutMode: "manual",
      nodes: [
        createTestNode({
          id: 1,
          label: "2件",
          sources: [source("設計", "1"), source("実装", "2")],
        }),
      ],
    };
    const { result } = renderNodes(twoSources);
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeSource(1, 0); });

    expect(removed).toBe(true);
    expect(nodeOf(result.current, 1).sources).toEqual([source("実装", "2")]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 1).sources).toEqual([source("設計", "1"), source("実装", "2")]);
  });

  it("最後の 1 件を消すと sources のキーごと外す", () => {
    const { result } = renderNodes();

    act(() => { result.current.removeNodeSource(2, 0); });

    expect("sources" in nodeOf(result.current, 2)).toBe(false);
  });

  it.each<[string, number, number]>([
    ["対象が無い", 99, 0],
    ["出典の無いノード", 3, 0],
    ["index が範囲外", 2, 1],
  ])("%s ときは false を返し、何も変えず履歴も積まない", (_name, id, index) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeSource(id, index); });

    expect(removed).toBe(false);
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });
});
