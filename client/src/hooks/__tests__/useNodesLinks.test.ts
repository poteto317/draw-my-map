import { act, renderHook } from "@testing-library/react";
import {
  NODE_LINKS_MAX_COUNT,
  type AddNodeLinkFailureReason,
  type AddNodeLinkOutcome,
} from "@/domain/nodes/nodeLink";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

const A = "https://example.com/a";
const B = "https://example.org/b";

// 正規化済みの URL を count 件（https://example.com/link0 …）
function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/link${index}`);
}

// 1: 根、2: URL あり、3: URL なし。ラベルは全ノードで変える（L-168）
function initialMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "URLあり", x: 220, links: [A] }),
      createTestNode({ id: 3, parentId: 1, label: "URLなし", x: 220, y: 100 }),
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

describe("useNodes の addNodeLink", () => {
  it("正規化した URL を末尾に足して { ok: true } を返し、1 回の履歴として確定する。1 回の Undo で戻り、documentRevision は変えない", () => {
    const { result } = renderNodes();
    const revision = result.current.documentRevision;
    let outcome!: AddNodeLinkOutcome;

    act(() => { outcome = result.current.addNodeLink(2, "HTTPS://Example.org/b"); });

    expect(outcome).toEqual({ ok: true });
    expect(nodeOf(result.current, 2).links).toEqual([A, B]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);

    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).links).toEqual([A]);
    expect(result.current.canUndo).toBe(false);
  });

  it("URL の無いノードにも追加できる", () => {
    const { result } = renderNodes();

    act(() => { result.current.addNodeLink(3, A); });

    expect(nodeOf(result.current, 3).links).toEqual([A]);
  });

  it.each<[string, number, string, AddNodeLinkFailureReason]>([
    ["対象が無い", 99, A, "node-missing"],
    ["空白だけ", 3, "   ", "empty"],
    ["形式が不正", 3, "example.com", "invalid"],
    ["http/https 以外", 3, "javascript:alert(1)", "unsupported-scheme"],
    ["資格情報つき", 3, "https://user:pass@example.com/", "has-credentials"],
    ["長すぎる", 3, `https://example.com/${"a".repeat(2048)}`, "too-long"],
    ["正規化すると同じ URL がすでにある", 2, "HTTPS://EXAMPLE.COM/a", "duplicate"],
  ])("%s ときは理由を返し、何も変えず履歴も積まない（L-135）", (_name, id, input, reason) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let outcome!: AddNodeLinkOutcome;

    act(() => { outcome = result.current.addNodeLink(id, input); });

    expect(outcome).toEqual({ ok: false, reason });
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("10 件あるノードへの追加は too-many で、何も変えない", () => {
    const full: NodeMapState = {
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "上限", links: linksOf(NODE_LINKS_MAX_COUNT) })],
    };
    const { result } = renderNodes(full);
    const before = result.current.nodes;
    let outcome!: AddNodeLinkOutcome;

    act(() => { outcome = result.current.addNodeLink(1, A); });

    expect(outcome).toEqual({ ok: false, reason: "too-many" });
    expect(result.current.nodes).toBe(before);
  });

  it("同じイベントの中の連続 2 回の追加は、最新の状態から判定して両方とも入り、2 回の履歴になる（L-453）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeLinkOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeLink(3, A));
      outcomes.push(result.current.addNodeLink(3, B));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: true }]);
    expect(nodeOf(result.current, 3).links).toEqual([A, B]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 3).links).toEqual([A]);
  });

  it("同じイベントの中で同じ URL を 2 回追加すると、2 回目は duplicate（古い状態で判定しない）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeLinkOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeLink(3, A));
      outcomes.push(result.current.addNodeLink(3, A));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: false, reason: "duplicate" }]);
    expect(nodeOf(result.current, 3).links).toEqual([A]);
  });

  it("自動配置でも追加でき、座標は変えない", () => {
    const { result } = renderNodes(initialMap("auto"));
    const before = nodeOf(result.current, 3);

    act(() => { result.current.addNodeLink(3, A); });

    expect(nodeOf(result.current, 3)).toEqual({ ...before, links: [A] });
  });

  it("関数参照は更新後も安定している", () => {
    const { result } = renderNodes();
    const { addNodeLink, removeNodeLink } = result.current;

    act(() => { result.current.addNodeLink(3, A); });

    expect(result.current.addNodeLink).toBe(addNodeLink);
    expect(result.current.removeNodeLink).toBe(removeNodeLink);
  });
});

describe("useNodes の removeNodeLink", () => {
  it("指定の URL だけを消して true を返し、1 回の Undo で戻る", () => {
    const twoLinks: NodeMapState = {
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "2件", links: [A, B] })],
    };
    const { result } = renderNodes(twoLinks);
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeLink(1, A); });

    expect(removed).toBe(true);
    expect(nodeOf(result.current, 1).links).toEqual([B]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 1).links).toEqual([A, B]);
  });

  it("最後の 1 件を消すと links のキーごと外す", () => {
    const { result } = renderNodes();

    act(() => { result.current.removeNodeLink(2, A); });

    expect("links" in nodeOf(result.current, 2)).toBe(false);
  });

  it.each<[string, number, string]>([
    ["対象が無い", 99, A],
    ["その URL を持たない", 2, B],
    ["正規化前の表記（保存した値と完全に一致しない）", 2, "HTTPS://EXAMPLE.COM/a"],
  ])("%s ときは false を返し、何も変えず履歴も積まない", (_name, id, url) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeLink(id, url); });

    expect(removed).toBe(false);
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });
});
