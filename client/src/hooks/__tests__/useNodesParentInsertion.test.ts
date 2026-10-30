import { renderHook, act } from "@testing-library/react";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import type { InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
import { createParentNode } from "@/domain/nodes/nodePlacement";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
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

function node(
  id: number,
  parentId: number | null,
  x: number,
  y: number,
  importance: NodeImportance = "medium",
): Node {
  return createTestNode({ id, parentId, x, y, width: 100, height: 60, label: `ノード${id}`, importance });
}

// R（1）の子 A（2）・T（4、重要度 high）・B（3）、T の子 Tc（6）。T の後ろに兄弟 B を置く
function manualMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [
      node(1, null, 0, 0),
      node(2, 1, 220, 0),
      node(4, 1, 220, 100, "high"),
      node(3, 1, 220, 200),
      node(6, 4, 440, 100),
    ],
  };
}

const ALL = new Set([1, 2, 4, 3, 6]);

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  jest.mocked(layoutNodeForest).mockClear();
  return view;
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((item) => item.id);
}

function byId(nodes: readonly Node[], id: number): Node {
  return nodes.find((item) => item.id === id)!;
}

function insert(
  current: () => Hook,
  nodeId: number,
  visible: ReadonlySet<number>,
): InsertParentNodeResult {
  let outcome!: InsertParentNodeResult;
  act(() => { outcome = current().insertParentNode(nodeId, visible); });
  return outcome;
}

describe("useNodes の親ノードの挿入", () => {
  afterEach(() => {
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("手動配置で T の位置に N を入れ、T の枝を平行移動して N を選択する", () => {
    const { result } = renderNodes(manualMap());
    act(() => result.current.selectNode(2));
    const revision = result.current.documentRevision;

    const outcome = insert(() => result.current, 4, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const x = outcome.insertedId;
    expect([1, 2, 3, 4, 6]).not.toContain(x);
    const nodes = result.current.nodes;
    expect(ids(nodes)).toEqual([1, 2, x, 4, 3, 6]);
    expect(byId(nodes, x)).toEqual({
      id: x, parentId: 1, x: 220, y: 100, width: 100, height: 60, label: "", importance: "high",
    });
    expect(byId(nodes, 4)).toMatchObject({ parentId: x, x: 440, y: 100 });
    expect(byId(nodes, 6)).toMatchObject({ x: 660, y: 100 });
    expect(result.current.selectedNodeId).toBe(x);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("自動配置で全体を配置し直す", () => {
    const { result } = renderNodes({
      layoutMode: "auto",
      nodes: [node(1, null, 30, 40), node(2, 1, 500, 500), node(4, 1, 37, -80, "low")],
    });
    const before = result.current.nodes;

    const outcome = insert(() => result.current, 4, new Set([1, 2, 4]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const x = outcome.insertedId;
    expect(result.current.nodes).toEqual(layoutNodeForest([
      before[0],
      before[1],
      createParentNode(before[2], x),
      { ...before[2], parentId: x },
    ]));
    expect(result.current.nodes[0]).toMatchObject({ x: before[0].x, y: before[0].y });
  });

  it("1回の commit で、Undo 1回で戻り Redo で挿入後に戻る", () => {
    const { result } = renderNodes(manualMap());
    insert(() => result.current, 4, ALL);
    const inserted = result.current.nodes;

    let undone = false;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.nodes).toEqual(manualMap().nodes);

    let redone = false;
    act(() => { redone = result.current.redo(); });
    expect(redone).toBe(true);
    expect(result.current.nodes).toEqual(inserted);

    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(false);
  });

  describe("失敗では何も変えない", () => {
    it.each<[
      string,
      NodeMapState,
      number,
      ReadonlySet<number>,
      InsertParentNodeResult,
      (() => void) | undefined,
    ]>([
      [
        "表示されていない T",
        manualMap(),
        4,
        new Set([1, 2, 3, 6]),
        { ok: false, reason: "node-hidden" },
        undefined,
      ],
      [
        "親が配列に無い T",
        { layoutMode: "manual", nodes: [node(1, null, 0, 0), node(4, 99, 220, 0)] },
        4,
        new Set([1, 4]),
        { ok: false, reason: "invalid-structure" },
        undefined,
      ],
      [
        "手動配置の溢れ",
        { layoutMode: "manual", nodes: [node(1, null, 0, 0), node(4, 1, 1e19, 100)] },
        4,
        new Set([1, 4]),
        { ok: false, reason: "placement-failed" },
        undefined,
      ],
      [
        "自動配置の失敗",
        {
          layoutMode: "auto",
          nodes: [node(1, null, 0, 0), node(4, 1, 220, 0)],
        },
        4,
        new Set([1, 4]),
        { ok: false, reason: "placement-failed" },
        () => jest.mocked(layoutNodeForest).mockImplementationOnce(() => null),
      ],
    ])("%s", (_, map, nodeId, visible, expected, arrange) => {
      const { result } = renderNodes(map);
      act(() => result.current.updateNodeLabel(1, "変更"));
      act(() => { result.current.undo(); });
      act(() => result.current.selectNode(1));
      expect(result.current.canRedo).toBe(true);
      const before = result.current;
      arrange?.();

      const outcome = insert(() => result.current, nodeId, visible);

      expect(outcome).toEqual(expected);
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.selectedNodeId).toBe(1);
      expect(result.current.canUndo).toBe(before.canUndo);
      expect(result.current.canRedo).toBe(true);
      expect(result.current.documentRevision).toBe(before.documentRevision);
    });

    it("自動配置で、座標が配置の結果と一致していないマップでも、失敗の候補を確定しない", () => {
      // 配置済みでないマップ（読み込んだ直後など）。候補を layoutNodeForest に通すと座標が動く
      const { result } = renderNodes({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0), node(2, 1, 0, 0), node(4, 1, 0, 0)],
      });
      const before = result.current;
      expect(before.canUndo).toBe(false);

      const outcome = insert(() => result.current, 99, new Set([1, 2, 4]));

      expect(outcome).toEqual({ ok: false, reason: "node-missing" });
      expect(jest.mocked(layoutNodeForest)).not.toHaveBeenCalled();
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.documentRevision).toBe(before.documentRevision);
    });
  });

  it("同じ act で作ったノードにも、最新の配列で解決して挿入できる", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [node(1, null, 0, 0), node(2, 1, 220, 0)],
    });
    let created!: number;
    let outcome!: InsertParentNodeResult;
    act(() => {
      created = result.current.addSiblingNode(2)!;
      outcome = result.current.insertParentNode(created, new Set([1, 2, created]));
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(byId(result.current.nodes, created).parentId).toBe(outcome.insertedId);
    expect(byId(result.current.nodes, outcome.insertedId).parentId).toBe(1);
  });

  it("続けて2回挿入すると、ID が重ならず親子が連なる", () => {
    const { result } = renderNodes(manualMap());
    const first = insert(() => result.current, 4, ALL);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = insert(() => result.current, 4, new Set([...ALL, first.insertedId]));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const all = ids(result.current.nodes);
    expect(new Set(all).size).toBe(all.length);
    expect(byId(result.current.nodes, second.insertedId).parentId).toBe(first.insertedId);
    expect(byId(result.current.nodes, 4).parentId).toBe(second.insertedId);
  });
});
