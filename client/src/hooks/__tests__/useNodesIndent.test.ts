import { renderHook, act } from "@testing-library/react";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import type { ChangeNodeIndentResult, NodeIndentDirection } from "@/domain/nodes/nodeIndent";
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

const LABELS: Record<number, string> = {
  1: "R",
  2: "A",
  4: "T",
  5: "A1",
  6: "Tc",
  10: "X",
};

function node(id: number, parentId: number | null, x: number, y: number): Node {
  return createTestNode({ id, parentId, x, y, width: 100, height: 60, label: LABELS[id] ?? `ノード${id}` });
}

// R（1）の子 A（2）・T（4）、T の子 Tc（6）
function manualMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [node(1, null, 0, 0), node(2, 1, 220, 0), node(4, 1, 220, 100), node(6, 4, 440, 100)],
  };
}

// R（1）の子 A（2）・T（4）、A の子 X（10）を自動配置にしたマップ
function autoMap(): NodeMapState {
  const nodes = layoutNodeForest([
    node(1, null, 0, 0),
    node(2, 1, 0, 0),
    node(4, 1, 0, 0),
    node(10, 2, 0, 0),
  ])!;
  return { layoutMode: "auto", nodes };
}

// 手動配置の M7: A の最後の子 A1 が遠すぎて T を下げられない
function cancellationMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [node(1, null, 0, 0), node(2, 1, 220, 0), node(5, 2, 440, 1e17), node(4, 1, 220, 100)],
  };
}

// T の親（99）が配列に無いマップ
function danglingMap(): NodeMapState {
  return { layoutMode: "manual", nodes: [node(1, null, 0, 0), node(4, 99, 220, 100)] };
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

function changeIndent(current: Hook, nodeId: number, direction: NodeIndentDirection): ChangeNodeIndentResult {
  let outcome!: ChangeNodeIndentResult;
  act(() => { outcome = current.changeNodeIndent(nodeId, direction, allIds(current)); });
  return outcome;
}

describe("useNodes の階層の上げ下げ", () => {
  afterEach(() => {
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("手動配置で T を下げると A の子になり、枝ごと平行移動する", () => {
    const { result } = renderNodes(manualMap());

    const outcome = changeIndent(result.current, 4, "indent");

    expect(outcome).toEqual({ ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 });
    const nodes = result.current.nodes;
    expect(byId(nodes, 4).parentId).toBe(2);
    expect(byId(nodes, 4)).toMatchObject({ x: 440, y: 0 });
    expect(byId(nodes, 6)).toMatchObject({ x: 660, y: 0 });
  });

  it("手動配置で下げた T を上げると R の子に戻り、A の下へ間隔を空けて置く", () => {
    const { result } = renderNodes(manualMap());
    changeIndent(result.current, 4, "indent");

    const outcome = changeIndent(result.current, 4, "outdent");

    expect(outcome).toEqual({ ok: true, direction: "outdent", newParentId: 1, newParentLabel: "R", depth: 2 });
    const nodes = result.current.nodes;
    expect(byId(nodes, 4).parentId).toBe(1);
    expect(byId(nodes, 4).x).toBe(220);
    const branchTop = Math.min(byId(nodes, 4).y, byId(nodes, 6).y);
    expect(branchTop).toBe(60 + 40);
  });

  it("自動配置で T を下げると layoutNodeForest の結果どおりに配置し、R を動かさない", () => {
    const { result } = renderNodes(autoMap());
    const rootBefore = byId(result.current.nodes, 1);

    const outcome = changeIndent(result.current, 4, "indent");

    expect(outcome).toEqual({ ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 });
    expect(byId(result.current.nodes, 4).parentId).toBe(2);
    expect(jest.mocked(layoutNodeForest)).toHaveBeenCalledTimes(1);
    const candidate = jest.mocked(layoutNodeForest).mock.calls.at(-1)![0];
    expect(result.current.nodes).toEqual(layoutNodeForest(candidate));
    expect(byId(result.current.nodes, 1)).toMatchObject({ x: rootBefore.x, y: rootBefore.y });
  });

  it("自動配置で X を上げると R の子として配列の A の直後に入り、layoutNodeForest の結果どおりに配置する", () => {
    const { result } = renderNodes(autoMap());
    const rootBefore = byId(result.current.nodes, 1);
    expect(ids(result.current.nodes)).toEqual([1, 2, 4, 10]);

    const outcome = changeIndent(result.current, 10, "outdent");

    expect(outcome).toEqual({ ok: true, direction: "outdent", newParentId: 1, newParentLabel: "R", depth: 2 });
    expect(byId(result.current.nodes, 10).parentId).toBe(1);
    expect(ids(result.current.nodes)).toEqual([1, 2, 10, 4]);
    expect(jest.mocked(layoutNodeForest)).toHaveBeenCalledTimes(1);
    const candidate = jest.mocked(layoutNodeForest).mock.calls.at(-1)![0];
    expect(result.current.nodes).toEqual(layoutNodeForest(candidate));
    expect(byId(result.current.nodes, 1)).toMatchObject({ x: rootBefore.x, y: rootBefore.y });
  });

  it("成功は1回の commit で、Undo 1回で戻り Redo で下げた直後に戻る", () => {
    const { result } = renderNodes(manualMap());
    const before = result.current.nodes;

    changeIndent(result.current, 4, "indent");
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
    act(() => result.current.selectNode(4));
    const revision = result.current.documentRevision;

    changeIndent(result.current, 4, "indent");

    expect(result.current.selectedNodeId).toBe(4);
    expect(result.current.documentRevision).toBe(revision);
  });

  describe("失敗では何も変えない", () => {
    it.each<[string, () => NodeMapState, number, NodeIndentDirection, ChangeNodeIndentResult]>([
      [
        "先頭の兄弟を下げる",
        manualMap,
        2,
        "indent",
        { ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: false, isRoot: false },
      ],
      [
        "ルートを上げる",
        manualMap,
        1,
        "outdent",
        { ok: false, reason: "at-edge", direction: "outdent" },
      ],
      [
        "親が配列に無いノードを上げる",
        danglingMap,
        4,
        "outdent",
        { ok: false, reason: "invalid-structure" },
      ],
      [
        "手動配置の桁落ち（M7）",
        cancellationMap,
        4,
        "indent",
        { ok: false, reason: "placement-failed" },
      ],
    ])("%s", (_, createMap, nodeId, direction, expected) => {
      const { result } = renderNodes(createMap());
      // Redo できる状態を作ってから失敗させる
      act(() => result.current.updateNodeLabel(1, "変更"));
      act(() => { result.current.undo(); });
      act(() => result.current.selectNode(nodeId));
      expect(result.current.canRedo).toBe(true);
      const before = observe(result.current);

      const outcome = changeIndent(result.current, nodeId, direction);

      expect(outcome).toEqual(expected);
      expect(observe(result.current)).toEqual(before);
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("自動配置で、座標が配置の結果と一致していないマップでも、先頭の兄弟を下げる失敗では何も変えない", () => {
      // 配置済みでないマップ（読み込んだ直後など）。候補を layoutNodeForest に通すと座標が動く
      const { result } = renderNodes({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0), node(2, 1, 0, 0), node(4, 1, 0, 0)],
      });
      act(() => result.current.updateNodeLabel(1, "変更"));
      act(() => { result.current.undo(); });
      act(() => result.current.selectNode(2));
      expect(result.current.canRedo).toBe(true);
      jest.mocked(layoutNodeForest).mockClear();
      const before = observe(result.current);

      const outcome = changeIndent(result.current, 2, "indent");

      expect(outcome).toEqual({ ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: false, isRoot: false });
      expect(jest.mocked(layoutNodeForest)).not.toHaveBeenCalled();
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

      const outcome = changeIndent(result.current, 4, "indent");

      expect(outcome).toEqual({ ok: false, reason: "placement-failed" });
      expect(jest.mocked(layoutNodeForest)).toHaveBeenCalledTimes(1);
      expect(observe(result.current)).toEqual(before);
      expect(result.current.nodes).toBe(before.nodes);
    });
  });

  it("新しい親は描画時ではなく操作時点の最新の配列で解決する", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [node(1, null, 0, 0), node(2, 1, 220, 0)],
    });

    let created!: number;
    let outcome!: ChangeNodeIndentResult;
    act(() => {
      created = result.current.addSiblingNode(2)!;
      outcome = result.current.changeNodeIndent(created, "indent", new Set([1, 2, created]));
    });

    expect(outcome).toEqual({ ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 });
    expect(byId(result.current.nodes, created).parentId).toBe(2);
  });
});
