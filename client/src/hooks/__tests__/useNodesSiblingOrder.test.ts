import { renderHook, act } from "@testing-library/react";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
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

type Hook = ReturnType<typeof useNodes>;

const STEP_UP: SiblingReorderRequest = { kind: "step", direction: "up" };

function node(id: number, parentId: number | null, x: number, y: number): Node {
  return createTestNode({ id, parentId, x, y, width: 100, height: 60, label: `ノード${id}` });
}

// ルート R（1）の子 A（2）・T（3）。T が末尾
function manualMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [node(1, null, 0, 0), node(2, 1, 400, 0), node(3, 1, 400, 100)],
  };
}

// ルート R（1）の子 2・3・4 を自動配置にしたマップ
function autoMap(): NodeMapState {
  const nodes = layoutNodeForest([
    node(1, null, 0, 0),
    node(2, 1, 0, 0),
    node(3, 1, 0, 0),
    node(4, 1, 0, 0),
  ])!;
  return { layoutMode: "auto", nodes };
}

// 手動配置の桁落ちで入れ替えられない入力
function cancellationMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [node(1, null, 0, 0), node(2, 1, 400, 0), node(3, 1, 400, 4), node(4, 3, 600, 1e17)],
  };
}

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  jest.mocked(layoutNodeForest).mockClear();
  return view;
}

function allIds(current: Hook): Set<number> {
  return new Set(current.nodes.map((item) => item.id));
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((item) => item.id);
}

function byId(nodes: readonly Node[], id: number): Node {
  return nodes.find((item) => item.id === id)!;
}

type Observed = Pick<Hook, "nodes" | "selectedNodeId" | "canUndo" | "canRedo" | "documentRevision" | "layoutMode">;

function observe(current: Hook): Observed {
  return {
    nodes: current.nodes,
    selectedNodeId: current.selectedNodeId,
    canUndo: current.canUndo,
    canRedo: current.canRedo,
    documentRevision: current.documentRevision,
    layoutMode: current.layoutMode,
  };
}

function reorder(current: Hook, nodeId: number, request: SiblingReorderRequest) {
  let outcome!: ReturnType<Hook["reorderSibling"]>;
  act(() => { outcome = current.reorderSibling(nodeId, request, allIds(current)); });
  return outcome;
}

describe("useNodes の兄弟の並べ替え", () => {
  afterEach(() => {
    jest.mocked(layoutNodeForest).mockClear();
  });

  it.each<[string, SiblingReorderRequest]>([
    ["step", STEP_UP],
    ["drop", { kind: "drop", target: { position: "before", anchorId: 2 } }],
  ])("手動配置の %s で T を A の前へ移し、縦位置を入れ替える", (_, request) => {
    const { result } = renderNodes(manualMap());

    const outcome = reorder(result.current, 3, request);

    expect(outcome).toEqual({ ok: true, direction: "up", visibleIndex: 0, visibleCount: 2, isRoot: false });
    expect(ids(result.current.nodes)).toEqual([1, 3, 2]);
    expect(byId(result.current.nodes, 3).y).toBe(0);
    expect(byId(result.current.nodes, 2).y).toBe(100);
  });

  it.each<[string, SiblingReorderRequest]>([
    ["step", STEP_UP],
    ["drop", { kind: "drop", target: { position: "before", anchorId: 3 } }],
  ])("自動配置の %s で末尾の子を上へ移し、layoutNodeForest の結果どおりに配置する", (_, request) => {
    const { result } = renderNodes(autoMap());

    const outcome = reorder(result.current, 4, request);

    expect(outcome).toEqual({ ok: true, direction: "up", visibleIndex: 1, visibleCount: 3, isRoot: false });
    expect(ids(result.current.nodes)).toEqual([1, 2, 4, 3]);
    const candidate = jest.mocked(layoutNodeForest).mock.calls.at(-1)![0];
    expect(ids(candidate)).toEqual([1, 2, 4, 3]);
    expect(result.current.nodes).toEqual(layoutNodeForest(candidate));
    expect(byId(result.current.nodes, 2).y).toBeLessThan(byId(result.current.nodes, 4).y);
    expect(byId(result.current.nodes, 4).y).toBeLessThan(byId(result.current.nodes, 3).y);
  });

  it("成功は1回の commit で、Undo 1回で戻り Redo で並べ替えた直後に戻る", () => {
    const { result } = renderNodes(manualMap());
    const before = result.current.nodes;

    reorder(result.current, 3, STEP_UP);
    const after = result.current.nodes;

    let undone = false;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.nodes).toEqual(before);
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(false);

    act(() => { result.current.redo(); });
    expect(result.current.nodes).toEqual(after);
  });

  it("成功しても選択と documentRevision を変えない", () => {
    const { result } = renderNodes(manualMap());
    act(() => result.current.selectNode(3));
    const revision = result.current.documentRevision;

    reorder(result.current, 3, STEP_UP);

    expect(result.current.selectedNodeId).toBe(3);
    expect(result.current.documentRevision).toBe(revision);
  });

  describe("失敗では何も変えない", () => {
    it.each<[string, () => NodeMapState, SiblingReorderRequest, number, ReturnType<Hook["reorderSibling"]>]>([
      [
        "先頭の子を上へ",
        manualMap,
        STEP_UP,
        2,
        { ok: false, reason: "at-edge", direction: "up", hiddenBeyond: false, isRoot: false },
      ],
      [
        "存在しない anchor へのドロップ",
        manualMap,
        { kind: "drop", target: { position: "before", anchorId: 99 } },
        3,
        { ok: false, reason: "invalid-target" },
      ],
      [
        "手動配置の桁落ち",
        cancellationMap,
        STEP_UP,
        3,
        { ok: false, reason: "placement-failed" },
      ],
    ])("%s", (_, createMap, request, nodeId, expected) => {
      const { result } = renderNodes(createMap());
      // Redo できる状態を作ってから失敗させる
      act(() => result.current.updateNodeLabel(1, "変更"));
      act(() => { result.current.undo(); });
      act(() => result.current.selectNode(nodeId));
      expect(result.current.canRedo).toBe(true);
      const before = observe(result.current);

      const outcome = reorder(result.current, nodeId, request);

      expect(outcome).toEqual(expected);
      expect(observe(result.current)).toEqual(before);
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("自動配置の layoutNodeForest が失敗したら placement-failed を返す", () => {
      const { result } = renderNodes(autoMap());
      act(() => result.current.updateNodeLabel(1, "変更"));
      act(() => { result.current.undo(); });
      expect(result.current.canRedo).toBe(true);
      const before = observe(result.current);
      jest.mocked(layoutNodeForest).mockImplementationOnce(() => null);

      const outcome = reorder(result.current, 4, STEP_UP);

      expect(outcome).toEqual({ ok: false, reason: "placement-failed" });
      expect(jest.mocked(layoutNodeForest)).toHaveBeenCalledTimes(1);
      expect(observe(result.current)).toEqual(before);
      expect(result.current.nodes).toBe(before.nodes);
    });
  });

  it("step は描画時ではなく操作時点の最新の配列で解決する", () => {
    const { result } = renderNodes(manualMap());

    let outcome!: ReturnType<Hook["reorderSibling"]>;
    act(() => {
      const created = result.current.addSiblingNode(3)!;
      outcome = result.current.reorderSibling(
        3,
        { kind: "step", direction: "down" },
        new Set([1, 2, 3, created]),
      );
    });

    expect(outcome).toMatchObject({ ok: true, direction: "down" });
    const childIds = result.current.nodes.filter((item) => item.parentId === 1).map((item) => item.id);
    expect(childIds).toEqual([2, expect.any(Number), 3]);
  });
});
