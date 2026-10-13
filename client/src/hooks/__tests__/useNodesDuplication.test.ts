import { renderHook, act } from "@testing-library/react";
import { RECT_HEIGHT, RECT_WIDTH, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { collectVisibleNodeIds } from "@/domain/nodes/nodeVisibility";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
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

const ILLUSTRATION = "data:image/jpeg;base64,AAAA";

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

// 親1 → 子2 → 孫3 と、独立したルート4
function baseMap(layoutMode: NodeLayoutMode, extra: Partial<Record<number, Partial<Node>>> = {}): NodeMapState {
  return {
    layoutMode,
    nodes: [
      node(1, null, 0, 0, extra[1]),
      node(2, 1, 333, 47, extra[2]),
      node(3, 2, 711, 89, extra[3]),
      node(4, null, 123, 901, extra[4]),
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

type BuiltBranch = { parentId: number; branchId: number; childId: number; grandchildId: number; otherId: number };

// 実際の操作で、親の下に「枝 → 子（画像あり） → 孫」をつなぎ、独立したルートも置く
function buildBranch(current: Hook): BuiltBranch {
  const parentId = current.addNode(100, 100);
  const branchId = current.addNode(500, 500);
  current.connectNodes(parentId, branchId);
  const childId = current.addChildNode(branchId)!;
  const grandchildId = current.addChildNode(childId)!;
  current.updateNodeLabel(branchId, "枝");
  current.updateNodeLabel(childId, "子");
  current.updateNodeLabel(grandchildId, "孫");
  current.attachIllustration(childId, ILLUSTRATION);
  current.updateNodeImportance(grandchildId, "low");
  const otherId = current.addNode(100, 1200);
  return { parentId, branchId, childId, grandchildId, otherId };
}

// 複製は元の部分木を同じ順で末尾へ追加する。座標を除き、IDと親だけが写し替わっていることを確かめる
function expectCopiesOf(sources: readonly Node[], copies: readonly Node[], rootParentId: number | null) {
  expect(copies).toHaveLength(sources.length);
  const copiedIdBySourceId = new Map(sources.map((source, index) => [source.id, copies[index].id]));
  sources.forEach((source, index) => {
    const copy = copies[index];
    expect(copy).toEqual({
      ...source,
      id: copiedIdBySourceId.get(source.id),
      parentId: index === 0 ? rootParentId : copiedIdBySourceId.get(source.parentId!),
      x: copy.x,
      y: copy.y,
    });
  });
}

describe("useNodes の枝の複製", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("手動配置で追加・接続・画像設定した枝を複製し、複製根を選択して1操作でUndo・Redoできる", () => {
    const { result } = renderNodes();
    let built!: BuiltBranch;
    act(() => { built = buildBranch(result.current); });
    const before = snapshot(result.current);
    const revision = result.current.documentRevision;
    const sources = before.nodes.filter((item) => (
      [built.branchId, built.childId, built.grandchildId].includes(item.id)
    ));

    let copiedRootId!: number | null;
    act(() => { copiedRootId = result.current.duplicateSubtree(built.branchId); });
    const after = snapshot(result.current);

    expect(after.nodes).toHaveLength(before.nodes.length + 3);
    expect(after.nodes.slice(0, before.nodes.length)).toEqual(before.nodes);
    const copies = after.nodes.slice(before.nodes.length);
    expectCopiesOf(sources, copies, built.parentId);
    expect(copies.map((item) => item.x)).toEqual(sources.map((item) => item.x));
    expect(copies[1].illustration).toBe(ILLUSTRATION);
    expect(copiedRootId).toBe(copies[0].id);
    expect(result.current.selectedNodeId).toBe(copiedRootId);
    expect(result.current.documentRevision).toBe(revision);
    expectUniqueIds(after.nodes);

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    act(() => { result.current.undo(); });
    expect(result.current.nodes.some((item) => item.id === built.otherId)).toBe(false);
    act(() => { result.current.redo(); });
    act(() => { result.current.redo(); });
    expect(snapshot(result.current)).toEqual(after);
    expect(result.current.canRedo).toBe(false);
  });

  it("自動配置では他の枝の移動も含めて1操作として完全に往復する", () => {
    const { result } = renderNodes();
    let built!: BuiltBranch;
    act(() => {
      built = buildBranch(result.current);
      result.current.setLayoutMode("auto");
    });
    const before = snapshot(result.current);
    const sources = before.nodes.filter((item) => (
      [built.branchId, built.childId, built.grandchildId].includes(item.id)
    ));

    let copiedRootId!: number | null;
    act(() => { copiedRootId = result.current.duplicateSubtree(built.branchId); });
    const after = snapshot(result.current);

    expect(after.layoutMode).toBe("auto");
    expectCopiesOf(sources, after.nodes.slice(before.nodes.length), built.parentId);
    expect(copiedRootId).toBe(after.nodes[before.nodes.length].id);
    expect(result.current.selectedNodeId).toBe(copiedRootId);
    const otherBefore = before.nodes.find((item) => item.id === built.otherId)!;
    const otherAfter = after.nodes.find((item) => item.id === built.otherId)!;
    expect(otherAfter.y).toBeGreaterThan(otherBefore.y);

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canRedo).toBe(true);
    act(() => { result.current.redo(); });
    expect(snapshot(result.current)).toEqual(after);
  });

  it("同じactで自動配置へ切り替えた直後の複製は最新の配置モードを使う", () => {
    const { result } = renderNodes(baseMap("manual"));
    const { setLayoutMode, duplicateSubtree } = result.current;

    let copiedRootId!: number | null;
    act(() => {
      setLayoutMode("auto");
      copiedRootId = duplicateSubtree(2);
    });

    expect(copiedRootId).not.toBeNull();
    // 自動配置では複製候補の座標を動かさずに自動配置へ渡す（手動配置なら下へずらす）
    const candidate = jest.mocked(layoutNodeForest).mock.calls.at(-1)![0];
    const copiedRoot = candidate.find((item) => item.id === copiedRootId)!;
    const sourceRoot = candidate.find((item) => item.id === 2)!;
    expect(copiedRoot.y).toBe(sourceRoot.y);
    expect(snapshot(result.current)).toEqual({ layoutMode: "auto", nodes: layoutNodeForest(candidate) });
  });

  it("同じactで手動配置へ切り替えた直後の複製は手動配置の位置へ置く", () => {
    const { result } = renderNodes(baseMap("auto"));
    const { setLayoutMode, duplicateSubtree } = result.current;
    const layoutCalls = jest.mocked(layoutNodeForest).mock.calls.length;

    let copiedRootId!: number | null;
    act(() => {
      setLayoutMode("manual");
      copiedRootId = duplicateSubtree(2);
    });

    expect(jest.mocked(layoutNodeForest).mock.calls.length).toBe(layoutCalls);
    const bottom = Math.max(...baseMap("auto").nodes.map((item) => item.y + item.height));
    const copiedRoot = result.current.nodes.find((item) => item.id === copiedRootId)!;
    expect(copiedRoot.y).toBe(bottom + SIBLING_VERTICAL_GAP);
    expect(result.current.layoutMode).toBe("manual");
  });

  it("同じactで追加した子をすぐ複製できる", () => {
    const { result } = renderNodes(baseMap("manual"));

    let addedId!: number | null;
    let copiedRootId!: number | null;
    act(() => {
      addedId = result.current.addChildNode(3);
      copiedRootId = result.current.duplicateSubtree(addedId!);
    });

    expect(copiedRootId).not.toBeNull();
    expect(result.current.nodes.find((item) => item.id === copiedRootId)!.parentId).toBe(3);
    expect(result.current.selectedNodeId).toBe(copiedRootId);
    expectUniqueIds(result.current.nodes);
  });

  it("同じactでの連続複製は最新の状態からIDを重ねずに2操作として記録する", () => {
    const { result } = renderNodes(baseMap("manual"));
    const before = snapshot(result.current);

    let first!: number | null;
    let second!: number | null;
    act(() => {
      first = result.current.duplicateSubtree(1);
      second = result.current.duplicateSubtree(1);
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(result.current.nodes).toHaveLength(before.nodes.length + 6);
    expectUniqueIds(result.current.nodes);
    expect(result.current.selectedNodeId).toBe(second);

    act(() => { result.current.undo(); });
    expect(result.current.nodes).toHaveLength(before.nodes.length + 3);
    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
  });

  it("読み込んだノードのIDと採番候補が衝突しても重ならないIDを使う", () => {
    const { result } = renderHook(() => useNodes());
    // 採番候補は1001, 1002, ... となり、読み込んだIDと重なる
    mockIncreasingNow(1000);
    const loaded: NodeMapState = {
      layoutMode: "manual",
      nodes: [node(1001, null, 0, 0), node(1002, 1001, 300, 0), node(1003, 1002, 600, 0)],
    };
    act(() => result.current.replaceMap(loaded));

    let copiedRootId!: number | null;
    act(() => { copiedRootId = result.current.duplicateSubtree(1001); });

    expect(copiedRootId).not.toBeNull();
    const copies = result.current.nodes.slice(loaded.nodes.length);
    expect(copies).toHaveLength(3);
    copies.forEach((item) => expect(ids(loaded.nodes)).not.toContain(item.id));
    expectUniqueIds(result.current.nodes);
  });

  it("時刻を固定してもUndo後の再複製はUndoしたIDと衝突しない", () => {
    const { result } = renderNodes(baseMap("manual"));
    // allocatorの単調増加だけで衝突を避けていることを確かめる（Undoでresetすると同じIDが再発行される）
    jest.spyOn(Date, "now").mockReturnValue(1000);

    act(() => { result.current.duplicateSubtree(1); });
    const firstCopyIds = ids(result.current.nodes.slice(4));
    act(() => { result.current.undo(); });
    act(() => { result.current.duplicateSubtree(1); });
    const secondCopyIds = ids(result.current.nodes.slice(4));

    expect(secondCopyIds).toHaveLength(3);
    secondCopyIds.forEach((id) => expect(firstCopyIds).not.toContain(id));
    expectUniqueIds(result.current.nodes);
    expect(result.current.canRedo).toBe(false);
  });

  type FailureCase = { name: string; initial: NodeMapState; sourceId: number; arrange?: () => void };
  const failureCases: FailureCase[] = [
    { name: "存在しないID", initial: baseMap("manual"), sourceId: 999 },
    {
      name: "手動配置で下端が有限値に収まらない",
      initial: {
        layoutMode: "manual",
        nodes: [node(1, null, 0, Number.MAX_VALUE, { height: Number.MAX_VALUE }), node(2, 1, 300, 0)],
      },
      sourceId: 2,
    },
    {
      name: "自動配置の失敗",
      initial: baseMap("auto"),
      sourceId: 2,
      arrange: () => { jest.mocked(layoutNodeForest).mockReturnValueOnce(null); },
    },
  ];

  it.each(failureCases)("$name ではnullを返し、選択・ノード・履歴・Redoを維持する", ({ initial, sourceId, arrange }) => {
    const { result } = renderNodes(initial);
    act(() => result.current.updateNodeLabel(1, "変更"));
    act(() => { result.current.undo(); });
    act(() => result.current.selectNode(1));
    const before = result.current.nodes;
    const revision = result.current.documentRevision;

    let copiedRootId!: number | null;
    act(() => {
      arrange?.();
      copiedRootId = result.current.duplicateSubtree(sourceId);
    });

    expect(copiedRootId).toBeNull();
    expect(result.current.nodes).toBe(before);
    expect(result.current.selectedNodeId).toBe(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("表示フィルターで見えない子孫も含めて部分木全体を複製する", () => {
    const initial = baseMap("manual", { 1: { importance: "high" }, 2: { importance: "low" }, 3: { importance: "low" } });
    expect(collectVisibleNodeIds(initial.nodes, "high").has(3)).toBe(false);
    const { result } = renderNodes(initial);

    let copiedRootId!: number | null;
    act(() => { copiedRootId = result.current.duplicateSubtree(1); });

    expect(copiedRootId).not.toBeNull();
    expectCopiesOf(initial.nodes.slice(0, 3), result.current.nodes.slice(4), null);
  });

  it("複製元そのものが表示フィルターで見えなくても複製してIDを返す", () => {
    const initial = baseMap("manual", { 3: { importance: "low" } });
    expect(collectVisibleNodeIds(initial.nodes, "high").has(3)).toBe(false);
    const { result } = renderNodes(initial);

    let copiedRootId!: number | null;
    act(() => { copiedRootId = result.current.duplicateSubtree(3); });

    expect(copiedRootId).not.toBeNull();
    expect(result.current.nodes.find((item) => item.id === copiedRootId)).toMatchObject({
      parentId: 2,
      importance: "low",
    });
    expect(result.current.selectedNodeId).toBe(copiedRootId);
  });

  it("ドラッグの移動グループ中に複製すると移動と複製の2操作になり、旧leaseは失効する", () => {
    const { result } = renderNodes(baseMap("manual"));
    const before = snapshot(result.current);

    let lease!: ReturnType<Hook["beginMoveHistory"]>;
    act(() => {
      lease = result.current.beginMoveHistory();
      result.current.moveNode(4, 200, 200);
      result.current.moveNode(4, 250, 260);
    });
    const moved = snapshot(result.current);
    act(() => { result.current.duplicateSubtree(1); });
    const duplicated = snapshot(result.current);

    expect(lease.isActive()).toBe(false);
    act(() => lease.finish());
    expect(snapshot(result.current)).toEqual(duplicated);

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(moved);
    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("duplicateSubtreeの関数参照は更新後も安定している", () => {
    const { result } = renderNodes(baseMap("manual"));
    const { duplicateSubtree } = result.current;

    act(() => { result.current.duplicateSubtree(1); });
    act(() => result.current.setLayoutMode("auto"));
    act(() => { result.current.undo(); });

    expect(result.current.duplicateSubtree).toBe(duplicateSubtree);
  });
});
