import { renderHook, act } from "@testing-library/react";
import { ILLUSTRATED_NODE_HEIGHT, RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
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
const OTHER_ILLUSTRATION = "data:image/jpeg;base64,BBBB";

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

// 親1 → 子2 → 孫3 と、独立したルート4。座標は自動配置の結果と一致しない値にする
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

type Hook = ReturnType<typeof useNodes>;

function renderNodes(initial: NodeMapState) {
  let id = 100;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

function snapshot(current: Hook): NodeMapState {
  return { layoutMode: current.layoutMode, nodes: current.nodes };
}

function otherNodeMoved(before: readonly Node[], after: readonly Node[], targetId: number): boolean {
  return after.some((item) => {
    if (item.id === targetId) return false;
    const previous = before.find((candidate) => candidate.id === item.id);
    return previous !== undefined && (previous.x !== item.x || previous.y !== item.y);
  });
}

type OperationCase = {
  name: string;
  initial: NodeMapState;
  run: (current: Hook) => void;
  verifyAfter?: (before: NodeMapState, after: NodeMapState) => void;
};

const operationCases: OperationCase[] = [
  {
    name: "addNode",
    initial: baseMap("manual"),
    run: (current) => { current.addNode(10, 20); },
    verifyAfter: (before, after) => expect(after.nodes).toHaveLength(before.nodes.length + 1),
  },
  {
    name: "addChildNode",
    initial: baseMap("auto"),
    run: (current) => { current.addChildNode(1); },
    verifyAfter: (before, after) => expect(after.nodes).toHaveLength(before.nodes.length + 1),
  },
  {
    name: "addSiblingNode",
    initial: baseMap("manual"),
    run: (current) => { current.addSiblingNode(2); },
    verifyAfter: (before, after) => expect(after.nodes).toHaveLength(before.nodes.length + 1),
  },
  {
    name: "deleteNode（親・子・孫）",
    initial: baseMap("manual"),
    run: (current) => current.deleteNode(1),
    verifyAfter: (_before, after) => expect(after.nodes.map((item) => item.id)).toEqual([4]),
  },
  {
    name: "connectNodes（自動配置）",
    initial: baseMap("auto"),
    run: (current) => { current.connectNodes(1, 4); },
    verifyAfter: (before, after) => {
      expect(after.nodes.find((item) => item.id === 4)!.parentId).toBe(1);
      expect(otherNodeMoved(before.nodes, after.nodes, 4)).toBe(true);
    },
  },
  {
    name: "updateNodeLabel",
    initial: baseMap("manual"),
    run: (current) => current.updateNodeLabel(2, "新しいラベル"),
  },
  {
    name: "updateNodeImportance",
    initial: baseMap("manual"),
    run: (current) => { current.updateNodeImportance(2, "high"); },
  },
  {
    name: "attachIllustration（自動配置）",
    initial: baseMap("auto"),
    run: (current) => { current.attachIllustration(2, ILLUSTRATION); },
    verifyAfter: (before, after) => {
      expect(after.nodes.find((item) => item.id === 2)!.illustration).toBe(ILLUSTRATION);
      expect(otherNodeMoved(before.nodes, after.nodes, 2)).toBe(true);
    },
  },
  {
    name: "attachIllustration（再生成結果の再設定）",
    initial: baseMap("auto", { 2: { illustration: ILLUSTRATION } }),
    run: (current) => { current.attachIllustration(2, OTHER_ILLUSTRATION); },
  },
  {
    name: "removeIllustration（自動配置）",
    initial: baseMap("auto", { 2: { illustration: ILLUSTRATION, height: ILLUSTRATED_NODE_HEIGHT } }),
    run: (current) => { current.removeIllustration(2); },
    verifyAfter: (before, after) => {
      expect("illustration" in after.nodes.find((item) => item.id === 2)!).toBe(false);
      expect(otherNodeMoved(before.nodes, after.nodes, 2)).toBe(true);
    },
  },
  {
    name: "moveNode（子孫ごと）",
    initial: baseMap("manual"),
    run: (current) => current.moveNode(1, 300, 400),
  },
  {
    name: "setLayoutMode manual→auto",
    initial: baseMap("manual"),
    run: (current) => current.setLayoutMode("auto"),
    verifyAfter: (_before, after) => expect(after.layoutMode).toBe("auto"),
  },
  {
    name: "setLayoutMode auto→manual",
    initial: baseMap("auto"),
    run: (current) => current.setLayoutMode("manual"),
  },
];

describe("useNodes の履歴", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(layoutNodeForest).mockClear();
  });

  it.each(operationCases)("$name は1操作としてUndo・Redoで完全に一致する", ({ initial, run, verifyAfter }) => {
    const { result } = renderNodes(initial);
    const before = snapshot(result.current);
    expect(result.current.canUndo).toBe(false);

    act(() => run(result.current));
    const after = snapshot(result.current);
    expect(after).not.toEqual(before);
    verifyAfter?.(before, after);
    expect(result.current.canUndo).toBe(true);

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => { result.current.redo(); });
    expect(snapshot(result.current)).toEqual(after);
    expect(result.current.canRedo).toBe(false);
  });

  it("空マップへのaddNodeをUndoすると空に戻り、Redoで追加後と一致する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => { result.current.addNode(10, 20); });
    // addNodeは座標を中心として扱うため、座標値ではなく追加後の配列で比較する
    const added = result.current.nodes;
    act(() => { result.current.undo(); });
    expect(result.current.nodes).toEqual([]);
    expect(result.current.canRedo).toBe(true);
    act(() => { result.current.redo(); });
    expect(result.current.nodes).toEqual(added);
  });

  it("同じactで追加→削除→Undoすると最新の履歴から追加ノードが戻る", () => {
    const { result } = renderNodes(baseMap("manual"));
    let addedId!: number;

    act(() => {
      addedId = result.current.addNode(10, 20);
      result.current.deleteNode(addedId);
      result.current.undo();
    });

    expect(result.current.nodes.map((item) => item.id)).toEqual([1, 2, 3, 4, addedId]);
  });

  it("成功したUndo・Redoだけが選択を解除しdocumentRevisionを増やす", () => {
    const { result } = renderNodes(baseMap("manual"));
    const revisionAfterReplace = result.current.documentRevision;

    act(() => result.current.selectNode(2));
    let undone!: boolean;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(false);
    expect(result.current.selectedNodeId).toBe(2);
    expect(result.current.documentRevision).toBe(revisionAfterReplace);

    act(() => result.current.updateNodeLabel(2, "変更"));
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.documentRevision).toBe(revisionAfterReplace + 1);

    act(() => result.current.selectNode(3));
    let redone!: boolean;
    act(() => { redone = result.current.redo(); });
    expect(redone).toBe(true);
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.documentRevision).toBe(revisionAfterReplace + 2);

    act(() => result.current.selectNode(3));
    act(() => { redone = result.current.redo(); });
    expect(redone).toBe(false);
    expect(result.current.selectedNodeId).toBe(3);
    expect(result.current.documentRevision).toBe(revisionAfterReplace + 2);
  });

  it("documentRevisionは0から始まりreplaceMapで増える", () => {
    const { result } = renderHook(() => useNodes());
    expect(result.current.documentRevision).toBe(0);

    act(() => result.current.replaceMap(baseMap("manual")));
    expect(result.current.documentRevision).toBe(1);
  });

  it("replaceMap後はUndo・Redoの両履歴が空になる", () => {
    const { result } = renderNodes(baseMap("manual"));
    act(() => result.current.updateNodeLabel(1, "a"));
    act(() => result.current.updateNodeLabel(1, "b"));
    act(() => { result.current.undo(); });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.replaceMap(baseMap("auto")));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(snapshot(result.current)).toEqual(baseMap("auto"));
  });

  it("Undo後の分岐で追加したノードのIDは既存ノードやUndoしたIDと衝突しない", () => {
    const { result } = renderNodes(baseMap("manual"));
    // 時刻を固定し、ID allocatorの単調増加だけで衝突を避けていることを確かめる（Undoでresetすると同じIDが再発行される）
    jest.spyOn(Date, "now").mockReturnValue(1000);
    let firstId!: number;
    let secondId!: number;
    act(() => { firstId = result.current.addNode(10, 20); });
    act(() => { result.current.undo(); });
    act(() => { secondId = result.current.addNode(30, 40); });

    expect(secondId).not.toBe(firstId);
    const ids = result.current.nodes.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.current.canRedo).toBe(false);
  });

  it("手動→自動→Undoで元の手動座標に戻り、Redoで同じ自動座標になる", () => {
    const { result } = renderNodes(baseMap("manual"));
    const manual = result.current.nodes;

    act(() => result.current.setLayoutMode("auto"));
    const auto = result.current.nodes;
    expect(auto).not.toEqual(manual);
    const layoutCalls = jest.mocked(layoutNodeForest).mock.calls.length;

    act(() => { result.current.undo(); });
    expect(result.current.layoutMode).toBe("manual");
    expect(result.current.nodes).toEqual(manual);

    act(() => { result.current.redo(); });
    expect(result.current.layoutMode).toBe("auto");
    expect(result.current.nodes).toEqual(auto);
    // 復元時は自動配置を再計算しない
    expect(jest.mocked(layoutNodeForest).mock.calls.length).toBe(layoutCalls);
  });

  it("選択だけの操作は履歴に記録しない", () => {
    const { result } = renderNodes(baseMap("manual"));

    act(() => result.current.selectNode(2));
    act(() => result.current.selectNode(null));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  type NoopCase = { name: string; initial: NodeMapState; run: (current: Hook) => void };
  const noopCases: NoopCase[] = [
    { name: "同値のラベル", initial: baseMap("manual"), run: (current) => current.updateNodeLabel(2, "ノード2") },
    { name: "存在しないIDのラベル", initial: baseMap("manual"), run: (current) => current.updateNodeLabel(999, "x") },
    { name: "存在しないIDの重要度", initial: baseMap("manual"), run: (current) => { current.updateNodeImportance(999, "high"); } },
    { name: "存在しないIDの削除", initial: baseMap("manual"), run: (current) => current.deleteNode(999) },
    { name: "存在しないIDの移動", initial: baseMap("manual"), run: (current) => current.moveNode(999, 1, 1) },
    { name: "同じ座標への移動", initial: baseMap("manual"), run: (current) => current.moveNode(2, 333, 47) },
    { name: "同じモードへの切り替え", initial: baseMap("manual"), run: (current) => current.setLayoutMode("manual") },
    { name: "循環する接続の拒否", initial: baseMap("manual"), run: (current) => { current.connectNodes(3, 1); } },
    { name: "自動配置中の移動の拒否", initial: baseMap("auto"), run: (current) => current.moveNode(4, 1, 1) },
    { name: "存在しないノードへの画像設定", initial: baseMap("manual"), run: (current) => { current.attachIllustration(999, ILLUSTRATION); } },
    {
      name: "自動配置の失敗",
      initial: baseMap("auto"),
      run: (current) => {
        jest.mocked(layoutNodeForest).mockReturnValueOnce(null);
        current.addChildNode(1);
      },
    },
    {
      name: "自動モードへの切り替え失敗",
      initial: baseMap("manual"),
      run: (current) => {
        jest.mocked(layoutNodeForest).mockReturnValueOnce(null);
        current.setLayoutMode("auto");
      },
    },
  ];

  it.each(noopCases)("$name は履歴を増やさずRedoを維持する", ({ initial, run }) => {
    const { result } = renderNodes(initial);
    act(() => result.current.updateNodeImportance(1, "high"));
    act(() => { result.current.undo(); });
    const before = snapshot(result.current);
    const revision = result.current.documentRevision;

    act(() => run(result.current));

    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);
    act(() => { result.current.redo(); });
    expect(result.current.nodes[0].importance).toBe("high");
  });

  type SameValueCase = { name: string; initial: NodeMapState; run: (current: Hook) => boolean };
  const sameValueCases: SameValueCase[] = [
    { name: "同値の重要度", initial: baseMap("manual"), run: (current) => current.updateNodeImportance(2, "medium") },
    {
      name: "同じ画像の再設定",
      initial: baseMap("manual", { 2: { illustration: ILLUSTRATION, height: ILLUSTRATED_NODE_HEIGHT } }),
      run: (current) => current.attachIllustration(2, ILLUSTRATION),
    },
    { name: "既存の親への接続", initial: baseMap("manual"), run: (current) => current.connectNodes(1, 2) },
  ];

  it.each(sameValueCases)("$name はtrueを返しつつ履歴とRedoを維持する", ({ initial, run }) => {
    const { result } = renderNodes(initial);
    act(() => result.current.updateNodeLabel(4, "変更"));
    act(() => { result.current.undo(); });
    const before = snapshot(result.current);

    let accepted!: boolean;
    act(() => { accepted = run(result.current); });

    expect(accepted).toBe(true);
    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("追加→ラベル確定→Undoでラベルが戻る→もう1回Undoでノードが消える", () => {
    const { result } = renderNodes(baseMap("manual"));
    let id!: number;
    act(() => { id = result.current.addNode(10, 20); });
    const added = result.current.nodes;
    act(() => result.current.updateNodeLabel(id, "確定ラベル"));

    act(() => { result.current.undo(); });
    expect(result.current.nodes).toEqual(added);

    act(() => { result.current.undo(); });
    expect(result.current.nodes.some((item) => item.id === id)).toBe(false);
  });

  it("移動グループの途中でラベルを変更すると移動とラベルの2操作になる", () => {
    const { result } = renderNodes(baseMap("manual"));
    const before = snapshot(result.current);

    act(() => {
      result.current.beginMoveHistory();
      result.current.moveNode(4, 200, 200);
      result.current.moveNode(4, 250, 260);
    });
    const moved = snapshot(result.current);
    act(() => result.current.updateNodeLabel(4, "移動中に変更"));

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(moved);
    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("移動グループ全体を1操作として戻す", () => {
    const { result } = renderNodes(baseMap("manual"));
    const before = snapshot(result.current);

    act(() => {
      const lease = result.current.beginMoveHistory();
      result.current.moveNode(1, 50, 50);
      result.current.moveNode(1, 80, 90);
      lease.finish();
    });
    expect(result.current.nodes[0]).toMatchObject({ x: 80, y: 90 });

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("履歴操作の関数参照は更新後も安定している", () => {
    const { result } = renderNodes(baseMap("manual"));
    const { undo, redo, beginMoveHistory } = result.current;

    act(() => result.current.updateNodeLabel(1, "a"));
    act(() => { result.current.undo(); });

    expect(result.current.undo).toBe(undo);
    expect(result.current.redo).toBe(redo);
    expect(result.current.beginMoveHistory).toBe(beginMoveHistory);
  });
});
