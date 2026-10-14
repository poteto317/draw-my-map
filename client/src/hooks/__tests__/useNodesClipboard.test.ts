import { renderHook, act } from "@testing-library/react";
import { RECT_HEIGHT, RECT_WIDTH, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import {
  decodeSubtreeClipboard,
  type SubtreeClipboardData,
} from "@/domain/clipboard/subtreeClipboardCodec";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { getIllustratedNodeMinHeight } from "@/domain/nodes/nodeIllustration";
import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";

jest.mock("@/domain/nodes/nodeAutoLayout", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
    "@/domain/nodes/nodeAutoLayout",
  );
  return {
    ...actual,
    layoutNodeForest: jest.fn(actual.layoutNodeForest),
  };
});

// コピー形式はV3と同じ検証を通すため、実際に読めるJPEGを使う
const ILLUSTRATION = createJpegDataUrl(128, 128);

type Hook = ReturnType<typeof useNodes>;

function node(id: number, parentId: number | null, x: number, y: number, extra: Partial<Node> = {}): Node {
  return createTestNode({
    id,
    parentId,
    x,
    y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: `ノード${id}`,
    ...extra,
  });
}

// 親1 → 子2（画像あり） → 孫3 と、独立したルート4。子2の高さはV3の正規化後の値にそろえる
function baseMap(layoutMode: NodeLayoutMode): NodeMapState {
  return {
    layoutMode,
    nodes: [
      node(1, null, 0, 0),
      node(2, 1, 333, 47, {
        illustration: ILLUSTRATION,
        height: getIllustratedNodeMinHeight(RECT_HEIGHT),
      }),
      node(3, 2, 711, 89, { importance: "low" }),
      node(4, null, 123, 901),
    ],
  };
}

function mockIncreasingNow(start: number) {
  let id = start;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
}

function renderNodes(initial?: NodeMapState) {
  mockIncreasingNow(100);
  const view = renderHook(() => useNodes());
  if (initial) act(() => view.result.current.replaceMap(initial));
  return view;
}

function snapshot(current: Hook): NodeMapState {
  return { layoutMode: current.layoutMode, nodes: current.nodes };
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((item) => item.id);
}

function expectUniqueIds(nodes: readonly Node[]) {
  expect(new Set(ids(nodes)).size).toBe(nodes.length);
}

function copyText(current: Hook, sourceId: number): string {
  const copied = current.copySubtree(sourceId);
  if (!copied.ok) throw new Error(`copy failed: ${copied.reason}`);
  return copied.value;
}

function decoded(text: string): SubtreeClipboardData {
  const result = decodeSubtreeClipboard(text);
  if (!result.ok) throw new Error(`decode failed: ${result.reason}`);
  return result.value;
}

// 貼り付けた枝は元の部分木を同じ順で末尾へ追加する。座標を除き、IDと親だけが写し替わっていることを確かめる
function expectPastedCopiesOf(sources: readonly Node[], copies: readonly Node[]) {
  expect(copies).toHaveLength(sources.length);
  const copiedIdBySourceId = new Map(sources.map((source, index) => [source.id, copies[index].id]));
  sources.forEach((source, index) => {
    const copy = copies[index];
    expect(copy).toEqual({
      ...source,
      id: copiedIdBySourceId.get(source.id),
      parentId: index === 0 ? null : copiedIdBySourceId.get(source.parentId!),
      x: copy.x,
      y: copy.y,
    });
  });
}

describe("useNodes の枝のコピー", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("コピーはノード・選択・履歴・Redoを変えず、版も進めない", () => {
    const { result } = renderNodes(baseMap("manual"));
    act(() => result.current.updateNodeLabel(4, "変更"));
    act(() => { result.current.undo(); });
    act(() => result.current.selectNode(4));
    const before = result.current.nodes;
    const revision = result.current.documentRevision;

    let copied!: ReturnType<Hook["copySubtree"]>;
    act(() => { copied = result.current.copySubtree(2); });

    expect(copied.ok).toBe(true);
    expect(result.current.nodes).toBe(before);
    expect(result.current.selectedNodeId).toBe(4);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("コピーした文字列は根と全子孫を含み、根だけを親から切り離す", () => {
    const { result } = renderNodes(baseMap("manual"));

    const data = decoded(copyText(result.current, 2));

    expect(data.rootId).toBe(2);
    expect(data.nodes).toEqual([
      { ...baseMap("manual").nodes[1], parentId: null },
      baseMap("manual").nodes[2],
    ]);
  });

  it("同じactでラベルを変えた直後のコピーは最新のラベルを使う", () => {
    const { result } = renderNodes(baseMap("manual"));

    let text!: string;
    act(() => {
      result.current.updateNodeLabel(3, "最新");
      text = copyText(result.current, 2);
    });

    expect(decoded(text).nodes.find((item) => item.id === 3)!.label).toBe("最新");
  });

  it("存在しないIDのコピーは失敗を返し、何も変えない", () => {
    const { result } = renderNodes(baseMap("manual"));
    const before = result.current.nodes;

    let copied!: ReturnType<Hook["copySubtree"]>;
    act(() => { copied = result.current.copySubtree(999); });

    expect(copied).toEqual({ ok: false, reason: "invalid" });
    expect(result.current.nodes).toBe(before);
  });

  it("copySubtreeとpasteSubtreeの関数参照は更新後も安定している", () => {
    const { result } = renderNodes(baseMap("manual"));
    const { copySubtree, pasteSubtree } = result.current;
    const data = decoded(copyText(result.current, 1));

    act(() => { result.current.pasteSubtree(data); });
    act(() => result.current.setLayoutMode("auto"));
    act(() => { result.current.undo(); });
    act(() => result.current.replaceMap(baseMap("manual")));

    expect(result.current.copySubtree).toBe(copySubtree);
    expect(result.current.pasteSubtree).toBe(pasteSubtree);
  });
});

describe("useNodes の枝の貼り付け", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("全ノードに新しいIDを振って独立した枝として追加し、根を選択して1操作でUndo・Redoできる", () => {
    const { result } = renderNodes(baseMap("manual"));
    const text = copyText(result.current, 1);
    act(() => result.current.selectNode(4));
    const before = snapshot(result.current);
    const revision = result.current.documentRevision;

    let pastedRootId!: number | null;
    act(() => { pastedRootId = result.current.pasteSubtree(decoded(text)); });
    const after = snapshot(result.current);

    const copies = after.nodes.slice(before.nodes.length);
    expect(after.nodes.slice(0, before.nodes.length)).toEqual(before.nodes);
    expectPastedCopiesOf(decoded(text).nodes, copies);
    copies.forEach((item) => expect(ids(before.nodes)).not.toContain(item.id));
    expect(copies[1].illustration).toBe(ILLUSTRATION);
    expect(copies[2].importance).toBe("low");
    // 選択中のノード4の子にはならない
    expect(copies[0].parentId).toBeNull();
    expect(pastedRootId).toBe(copies[0].id);
    expect(result.current.selectedNodeId).toBe(pastedRootId);
    expect(result.current.documentRevision).toBe(revision);
    expectUniqueIds(after.nodes);

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    act(() => { result.current.redo(); });
    expect(snapshot(result.current)).toEqual(after);
    expect(result.current.canRedo).toBe(false);
  });

  it("手動配置ではマップの下端から間隔を空けた位置へ枝を平行移動する", () => {
    const { result } = renderNodes(baseMap("manual"));
    const data = decoded(copyText(result.current, 2));

    let pastedRootId!: number | null;
    act(() => { pastedRootId = result.current.pasteSubtree(data); });

    const bottom = Math.max(...baseMap("manual").nodes.map((item) => item.y + item.height));
    const copies = result.current.nodes.slice(4);
    expect(copies[0].id).toBe(pastedRootId);
    expect(copies[0].y).toBe(bottom + SIBLING_VERTICAL_GAP);
    expect(copies[1].y - copies[0].y).toBe(data.nodes[1].y - data.nodes[0].y);
    expect(copies.map((item) => item.x)).toEqual(data.nodes.map((item) => item.x));
  });

  it("コピー後に元の枝を編集・削除しても、コピーした時点の内容を貼り付ける", () => {
    const { result } = renderNodes(baseMap("manual"));
    const text = copyText(result.current, 1);
    const copiedNodes = decoded(text).nodes;

    act(() => {
      result.current.updateNodeLabel(2, "編集後");
      result.current.deleteNode(1);
    });
    let pastedRootId!: number | null;
    act(() => { pastedRootId = result.current.pasteSubtree(decoded(text)); });

    expect(pastedRootId).not.toBeNull();
    const copies = result.current.nodes.slice(1);
    expectPastedCopiesOf(copiedNodes, copies);
    expect(copies[1].label).toBe("ノード2");
  });

  it("同じactで自動配置へ切り替えた直後の貼り付けは最新の配置モードを使う", () => {
    const { result } = renderNodes(baseMap("manual"));
    const data = decoded(copyText(result.current, 2));
    const { setLayoutMode, pasteSubtree } = result.current;

    let pastedRootId!: number | null;
    act(() => {
      setLayoutMode("auto");
      pastedRootId = pasteSubtree(data);
    });

    expect(pastedRootId).not.toBeNull();
    // 自動配置では貼り付け候補の座標を動かさずに自動配置へ渡す（手動配置なら下へずらす）
    const candidate = jest.mocked(layoutNodeForest).mock.calls.at(-1)![0];
    const pastedRoot = candidate.find((item) => item.id === pastedRootId)!;
    expect(pastedRoot.y).toBe(data.nodes[0].y);
    expect(snapshot(result.current)).toEqual({ layoutMode: "auto", nodes: layoutNodeForest(candidate) });
    expect(result.current.selectedNodeId).toBe(pastedRootId);
  });

  it("同じactで手動配置へ切り替えた直後の貼り付けは手動配置の位置へ置く", () => {
    const { result } = renderNodes(baseMap("auto"));
    const data = decoded(copyText(result.current, 2));
    const { setLayoutMode, pasteSubtree } = result.current;
    const layoutCalls = jest.mocked(layoutNodeForest).mock.calls.length;

    let pastedRootId!: number | null;
    act(() => {
      setLayoutMode("manual");
      pastedRootId = pasteSubtree(data);
    });

    expect(jest.mocked(layoutNodeForest).mock.calls.length).toBe(layoutCalls);
    const bottom = Math.max(...baseMap("auto").nodes.map((item) => item.y + item.height));
    expect(result.current.nodes.find((item) => item.id === pastedRootId)!.y).toBe(bottom + SIBLING_VERTICAL_GAP);
    expect(result.current.layoutMode).toBe("manual");
  });

  it("同じactでの連続貼り付けは最新の状態からIDを重ねずに2操作として記録する", () => {
    const { result } = renderNodes(baseMap("manual"));
    const data = decoded(copyText(result.current, 1));
    const before = snapshot(result.current);

    let first!: number | null;
    let second!: number | null;
    act(() => {
      first = result.current.pasteSubtree(data);
      second = result.current.pasteSubtree(data);
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(result.current.nodes).toHaveLength(before.nodes.length + 6);
    expectUniqueIds(result.current.nodes);
    // 2回目は1回目の枝より下へ置く
    const firstRoot = result.current.nodes.find((item) => item.id === first)!;
    const secondRoot = result.current.nodes.find((item) => item.id === second)!;
    expect(secondRoot.y).toBeGreaterThan(firstRoot.y);
    expect(result.current.selectedNodeId).toBe(second);

    act(() => { result.current.undo(); });
    expect(result.current.nodes).toHaveLength(before.nodes.length + 3);
    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
  });

  it("貼り付けるデータのIDやallocatorの採番候補が現在のIDと衝突しても重ならないIDを使う", () => {
    const { result } = renderHook(() => useNodes());
    // 採番候補は1001, 1002, ... となり、読み込んだIDとも貼り付けるデータのIDとも重なる
    mockIncreasingNow(1000);
    const loaded: NodeMapState = {
      layoutMode: "manual",
      nodes: [node(1001, null, 0, 0), node(1002, 1001, 300, 0), node(1003, 1002, 600, 0)],
    };
    act(() => result.current.replaceMap(loaded));
    const data = decoded(copyText(result.current, 1001));

    let pastedRootId!: number | null;
    act(() => { pastedRootId = result.current.pasteSubtree(data); });

    expect(pastedRootId).not.toBeNull();
    const copies = result.current.nodes.slice(loaded.nodes.length);
    expect(copies).toHaveLength(3);
    copies.forEach((item) => expect(ids(loaded.nodes)).not.toContain(item.id));
    expectUniqueIds(result.current.nodes);
  });

  it("時刻を固定してもUndo後の再貼り付けはUndoしたIDと衝突しない", () => {
    const { result } = renderNodes(baseMap("manual"));
    const data = decoded(copyText(result.current, 1));
    // allocatorの単調増加だけで衝突を避けていることを確かめる（Undoでresetすると同じIDが再発行される）
    jest.spyOn(Date, "now").mockReturnValue(1000);

    act(() => { result.current.pasteSubtree(data); });
    const firstCopyIds = ids(result.current.nodes.slice(4));
    act(() => { result.current.undo(); });
    act(() => { result.current.pasteSubtree(data); });
    const secondCopyIds = ids(result.current.nodes.slice(4));

    expect(secondCopyIds).toHaveLength(3);
    secondCopyIds.forEach((id) => expect(firstCopyIds).not.toContain(id));
    expectUniqueIds(result.current.nodes);
    expect(result.current.canRedo).toBe(false);
  });

  type FailureCase = { name: string; initial: NodeMapState; data: SubtreeClipboardData; arrange?: () => void };
  const failureCases: FailureCase[] = [
    {
      name: "手動配置で下端が有限値に収まらない",
      initial: {
        layoutMode: "manual",
        nodes: [node(1, null, 0, Number.MAX_VALUE, { height: Number.MAX_VALUE }), node(2, 1, 300, 0)],
      },
      data: { nodes: [node(10, null, 0, 0), node(11, 10, 300, 0)], rootId: 10 },
    },
    {
      name: "手動配置で右端が有限値に収まらない",
      initial: baseMap("manual"),
      data: { nodes: [node(10, null, Number.MAX_VALUE, 0, { width: Number.MAX_VALUE })], rootId: 10 },
    },
    {
      name: "自動配置の失敗",
      initial: baseMap("auto"),
      data: { nodes: [node(10, null, 0, 0), node(11, 10, 300, 0)], rootId: 10 },
      arrange: () => { jest.mocked(layoutNodeForest).mockReturnValueOnce(null); },
    },
  ];

  it.each(failureCases)("$name ではnullを返し、選択・ノード・履歴・Redoを維持する", ({ initial, data, arrange }) => {
    const { result } = renderNodes(initial);
    act(() => result.current.updateNodeLabel(1, "変更"));
    act(() => { result.current.undo(); });
    act(() => result.current.selectNode(1));
    const before = result.current.nodes;
    const revision = result.current.documentRevision;

    let pastedRootId!: number | null;
    act(() => {
      arrange?.();
      pastedRootId = result.current.pasteSubtree(data);
    });

    expect(pastedRootId).toBeNull();
    expect(result.current.nodes).toBe(before);
    expect(result.current.selectedNodeId).toBe(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("コピー後にマップを置き換えても、コピーした枝を新しいマップへ貼り付けられる", () => {
    const { result } = renderNodes(baseMap("manual"));
    const text = copyText(result.current, 2);
    const replacement: NodeMapState = {
      layoutMode: "manual",
      nodes: [node(2, null, 0, 0, { label: "別マップ" }), node(3, 2, 300, 0)],
    };
    act(() => result.current.replaceMap(replacement));

    let pastedRootId!: number | null;
    act(() => { pastedRootId = result.current.pasteSubtree(decoded(text)); });

    expect(pastedRootId).not.toBeNull();
    expect(result.current.nodes.slice(0, 2)).toEqual(replacement.nodes);
    const copies = result.current.nodes.slice(2);
    expectPastedCopiesOf(decoded(text).nodes, copies);
    expect(copies[0].illustration).toBe(ILLUSTRATION);
    expectUniqueIds(result.current.nodes);
    expect(result.current.selectedNodeId).toBe(pastedRootId);
  });

  it("空のマップへ貼り付けると座標を動かさずに置く", () => {
    const { result } = renderNodes(baseMap("manual"));
    const text = copyText(result.current, 2);
    act(() => result.current.replaceMap({ layoutMode: "manual", nodes: [] }));

    let pastedRootId!: number | null;
    act(() => { pastedRootId = result.current.pasteSubtree(decoded(text)); });

    expect(pastedRootId).not.toBeNull();
    expect(result.current.nodes.map((item) => [item.x, item.y])).toEqual(
      decoded(text).nodes.map((item) => [item.x, item.y]),
    );
  });

  it("貼り付け後のマップはV3の保存形式で往復できる", () => {
    const { result } = renderNodes(baseMap("manual"));
    const data = decoded(copyText(result.current, 1));
    act(() => { result.current.pasteSubtree(data); });

    const json = serializeMapDocument(createMapDocument(result.current.nodes, result.current.layoutMode));
    const parsed = parseMapDocumentJson(json);

    expect(parsed).toEqual({
      ok: true,
      value: createMapDocument(result.current.nodes, result.current.layoutMode),
    });
    expect(parsed.ok && parsed.value.nodes).toHaveLength(7);
  });
});
