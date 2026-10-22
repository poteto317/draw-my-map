import { renderHook, act } from "@testing-library/react";
import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
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

const actualLayoutNodeForest = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
  "@/domain/nodes/nodeAutoLayout",
).layoutNodeForest;

type Hook = ReturnType<typeof useNodes>;
type InsertResult = ReturnType<Hook["insertForest"]>;

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

// 独立したルート1・2の2ノード。自動配置では配置済みの座標から始め、取り込みで動いたことを観測できるようにする
function twoNodeMap(layoutMode: NodeLayoutMode): NodeMapState {
  const nodes = [node(1, null, 0, 0), node(2, null, 0, 200)];
  return {
    layoutMode,
    nodes: layoutMode === "auto" ? actualLayoutNodeForest(nodes)! : nodes,
  };
}

// 3本の木: A（子 A1）、B（子 B1 → 孫 B2）、C
const THREE_TREES: ForestItem[] = [
  { label: "A", parentIndex: null },
  { label: "A1", parentIndex: 0 },
  { label: "B", parentIndex: null },
  { label: "B1", parentIndex: 2 },
  { label: "B2", parentIndex: 3 },
  { label: "C", parentIndex: null },
];

function renderNodes(initial?: NodeMapState) {
  // 時刻を固定し、allocatorの採番を 1000, 1001, ... の連番にする
  jest.spyOn(Date, "now").mockReturnValue(1000);
  const view = renderHook(() => useNodes());
  if (initial) act(() => view.result.current.replaceMap(initial));
  return view;
}

function snapshot(current: Hook): NodeMapState {
  return { layoutMode: current.layoutMode, nodes: current.nodes };
}

function findByLabel(nodes: readonly Node[], label: string): Node {
  const found = nodes.find((item) => item.label === label);
  if (!found) throw new Error(`node not found: ${label}`);
  return found;
}

function insert(current: Hook, items: readonly ForestItem[], target: Parameters<Hook["insertForest"]>[1]): InsertResult {
  let result!: InsertResult;
  act(() => { result = current.insertForest(items, target); });
  return result;
}

describe("useNodes の森の挿入", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // 失敗のケースで差し替えた実装を、assert の成否にかかわらず実物へ戻す
    jest.mocked(layoutNodeForest).mockImplementation(actualLayoutNodeForest);
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("自動配置のマップへの取り込みは1回のUndoで、追加したノードと動いた既存のノードがすべて戻る", () => {
    const { result } = renderNodes(twoNodeMap("auto"));
    const before = snapshot(result.current);

    const inserted = insert(result.current, THREE_TREES, { kind: "child", parentId: 1 });
    expect(inserted.ok).toBe(true);
    const after = snapshot(result.current);
    expect(after.nodes).toHaveLength(before.nodes.length + THREE_TREES.length);
    // ルート1の子が増えたため、自動配置でその下のルート2が動いている
    expect(after.nodes.find((item) => item.id === 2)).not.toEqual(before.nodes[1]);

    act(() => { result.current.undo(); });
    expect(snapshot(result.current)).toEqual(before);
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(snapshot(result.current)).toEqual(after);
  });

  it("取り込みは履歴を1つだけ増やす", () => {
    const { result } = renderNodes();
    act(() => { result.current.addNode(0, 0); });
    const single = snapshot(result.current);

    const inserted = insert(result.current, THREE_TREES, { kind: "root" });
    expect(inserted.ok).toBe(true);

    let undone!: boolean;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(snapshot(result.current)).toEqual(single);
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.nodes).toEqual([]);
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(false);
  });

  it("新しいルートとして3本の木を追加すると、1本目の根を選択してそのIDを返す", () => {
    const { result } = renderNodes(twoNodeMap("manual"));
    act(() => result.current.selectNode(2));

    const inserted = insert(result.current, THREE_TREES, { kind: "root" });

    const rootA = findByLabel(result.current.nodes, "A");
    expect(inserted).toEqual({ ok: true, rootId: rootA.id, count: THREE_TREES.length });
    expect(rootA.parentId).toBeNull();
    expect(result.current.selectedNodeId).toBe(rootA.id);
    expect(result.current.selectedNodeId).not.toBe(findByLabel(result.current.nodes, "B").id);
    expect(result.current.selectedNodeId).not.toBe(findByLabel(result.current.nodes, "C").id);
  });

  it("子として3本の木を追加すると、最初の子を選択する", () => {
    const { result } = renderNodes(twoNodeMap("manual"));
    act(() => result.current.selectNode(2));

    const inserted = insert(result.current, THREE_TREES, { kind: "child", parentId: 1 });

    const childA = findByLabel(result.current.nodes, "A");
    const childC = findByLabel(result.current.nodes, "C");
    expect(childA.parentId).toBe(1);
    expect(childC.parentId).toBe(1);
    expect(inserted).toEqual({ ok: true, rootId: childA.id, count: THREE_TREES.length });
    expect(result.current.selectedNodeId).toBe(childA.id);
  });

  it("documentRevisionを変えず、countは項目の数を返す", () => {
    const { result } = renderNodes(twoNodeMap("manual"));
    const revision = result.current.documentRevision;
    const items: ForestItem[] = [
      { label: "X", parentIndex: null },
      { label: "Y", parentIndex: 0 },
    ];

    const inserted = insert(result.current, items, { kind: "root" });

    expect(inserted.ok && inserted.count).toBe(2);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("Redoで、追加直後と同じID・ラベル・座標に戻る", () => {
    const { result } = renderNodes(twoNodeMap("manual"));
    insert(result.current, THREE_TREES, { kind: "root" });
    const after = snapshot(result.current);

    act(() => { result.current.undo(); });
    act(() => { result.current.redo(); });

    expect(snapshot(result.current)).toEqual(after);
  });

  type FailureCase = {
    name: string;
    initial: NodeMapState;
    items: ForestItem[];
    target: Parameters<Hook["insertForest"]>[1];
    reason: string;
    // 失敗の後の addNode が受け取るID。採番の前に失敗すれば allocator は進まず 1000 になる
    nextId: number;
    arrange?: () => void;
  };
  const failureCases: FailureCase[] = [
    {
      name: "存在しない親",
      initial: twoNodeMap("manual"),
      items: THREE_TREES,
      target: { kind: "child", parentId: 999 },
      reason: "parent-missing",
      nextId: 1000,
    },
    {
      name: "不正な項目",
      initial: twoNodeMap("manual"),
      items: [],
      target: { kind: "root" },
      reason: "invalid-items",
      nextId: 1000,
    },
    {
      name: "手動配置で下端が有限値に収まらない",
      initial: {
        layoutMode: "manual",
        nodes: [node(1, null, 0, Number.MAX_VALUE, { height: Number.MAX_VALUE }), node(2, 1, 300, 0)],
      },
      items: THREE_TREES,
      target: { kind: "root" },
      reason: "placement-failed",
      nextId: 1000,
    },
    {
      name: "自動配置の失敗",
      initial: twoNodeMap("auto"),
      items: THREE_TREES,
      target: { kind: "root" },
      reason: "placement-failed",
      // 全体の再配置は採番の後に行うため、確定しなかった6件のIDは欠番のままにする
      nextId: 1006,
      // 取り込みの候補（ラベル A のノードを含む）のときだけ自動配置を失敗させる
      arrange: () => {
        jest.mocked(layoutNodeForest).mockImplementation((nodes) => (
          nodes.some((item) => item.label === "A") ? null : actualLayoutNodeForest(nodes)
        ));
      },
    },
  ];

  it.each(failureCases)("$name では理由を返し、ノード・選択・履歴・Redo・allocatorを維持する", ({ initial, items, target, reason, nextId, arrange }) => {
    const { result } = renderNodes(initial);
    act(() => result.current.updateNodeLabel(2, "変更"));
    act(() => { result.current.undo(); });
    act(() => result.current.selectNode(2));
    const before = result.current.nodes;
    const revision = result.current.documentRevision;
    arrange?.();

    const inserted = insert(result.current, items, target);

    expect(inserted).toEqual({ ok: false, reason });
    expect(result.current.nodes).toBe(before);
    expect(result.current.selectedNodeId).toBe(2);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);

    let addedId!: number;
    act(() => { addedId = result.current.addNode(0, 0); });
    expect(addedId).toBe(nextId);
  });

  it("10,000段の鎖を自動配置のマップへ追加しても例外を出さない", () => {
    const { result } = renderNodes(twoNodeMap("auto"));
    const chain: ForestItem[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      chain.push({ label: `L${index}`, parentIndex: index === 0 ? null : index - 1 });
    }

    const inserted = insert(result.current, chain, { kind: "root" });

    expect(inserted.ok && inserted.count).toBe(10_000);
    expect(result.current.nodes).toHaveLength(10_002);
  });
});
