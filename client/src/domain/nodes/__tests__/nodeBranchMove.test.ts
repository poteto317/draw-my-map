import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { listBranchMoveParentCandidates, moveNodeBranch, transferNodeBranch } from "@/domain/nodes/nodeBranchMove";
import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import type { AllocateNodeIds } from "@/domain/nodes/nodeSubtreeInsertion";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

jest.mock("@/domain/nodes/nodeAutoLayout", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
    "@/domain/nodes/nodeAutoLayout",
  );
  return { ...actual, layoutNodeForest: jest.fn(actual.layoutNodeForest) };
});

function node(id: number, parentId: number | null, x: number, y: number, extra: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, x, y, width: 100, height: 60, label: `ノード${id}`, ...extra });
}

describe("listBranchMoveParentCandidates", () => {
  it("枝の中のノードと今の親を候補から除く", () => {
    const nodes = [node(1, null, 0, 0), node(2, 1, 300, 0), node(3, 2, 600, 0), node(4, null, 0, 300), node(5, 1, 300, 300)];
    expect(listBranchMoveParentCandidates(nodes, nodes[1]).map(({ id }) => id)).toEqual([4, 5]);
  });

  it("ルートの枝はほかのノードをすべて候補にする", () => {
    const nodes = [node(1, null, 0, 0), node(2, 1, 300, 0), node(3, null, 0, 300)];
    expect(listBranchMoveParentCandidates(nodes, nodes[0]).map(({ id }) => id)).toEqual([3]);
  });
});

describe("moveNodeBranch", () => {
  const nodes = [
    node(1, null, 0, 0),
    node(3, 2, 600, 80, { label: "隠れた孫", importance: "high", illustration: "data:image/png;base64,AAA" }),
    node(2, 1, 300, 20),
    node(4, null, 0, 300),
    node(5, 4, 300, 300),
  ];

  it("非連続の枝を任意の親の最後へ移し、ID・属性・枝内順序を保持する", () => {
    const result = moveNodeBranch(nodes, 2, 4, "manual");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rootId).toBe(2);
    expect(result.nodes.map(({ id }) => id)).toEqual([1, 4, 5, 3, 2]);
    expect(result.nodes.find(({ id }) => id === 2)!.parentId).toBe(4);
    expect(result.nodes.find(({ id }) => id === 3)).toMatchObject({
      id: 3, parentId: 2, label: "隠れた孫", importance: "high", illustration: "data:image/png;base64,AAA",
    });
    const movedRoot = result.nodes.find(({ id }) => id === 2)!;
    const movedChild = result.nodes.find(({ id }) => id === 3)!;
    expect(movedChild.x - movedRoot.x).toBe(300);
    expect(movedChild.y - movedRoot.y).toBe(60);
  });

  it("ルートへ移す枝を残ったノードの下へ平行移動し、最後のルートにする", () => {
    const result = moveNodeBranch(nodes, 2, null, "manual");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.map(({ id }) => id)).toEqual([1, 4, 5, 3, 2]);
    const root = result.nodes.find(({ id }) => id === 2)!;
    const child = result.nodes.find(({ id }) => id === 3)!;
    expect(root.parentId).toBeNull();
    expect(root.y).toBeGreaterThan(360);
    expect(child.y - root.y).toBe(60);
  });

  it("autoでは枝を末尾へ移してforest全体を再配置する", () => {
    const initial = layoutNodeForest(nodes)!;
    const result = moveNodeBranch(initial, 2, 4, "auto");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes).toEqual(layoutNodeForest(result.nodes));
    expect(result.nodes.map(({ id }) => id)).toEqual([1, 4, 5, 3, 2]);
  });

  it.each([
    ["不存在", 99, 4, "missing-node"],
    ["親不存在", 2, 99, "invalid-parent"],
    ["子孫を親", 2, 3, "invalid-parent"],
    ["同じ親", 2, 1, "same-parent"],
  ] as const)("%sを拒否して入力を変えない", (_name, rootId, parentId, reason) => {
    const before = nodes.map((item) => ({ ...item }));
    expect(moveNodeBranch(nodes, rootId, parentId, "manual")).toEqual({ ok: false, reason });
    expect(nodes).toEqual(before);
  });

  it("有限座標を作れないとplacement-failedで入力を変えない", () => {
    const invalid = [node(1, null, 1e308, 0, { width: 1e308 }), node(2, null, 0, 0)];
    const before = invalid.map((item) => ({ ...item }));
    expect(moveNodeBranch(invalid, 2, 1, "manual")).toEqual({ ok: false, reason: "placement-failed" });
    expect(invalid).toEqual(before);
  });

  it("移動対象を含む親子循環をinvalid-parentとして拒否する", () => {
    const cyclic = [node(1, 2, 0, 0), node(2, 1, 300, 0), node(3, null, 0, 300)];
    expect(moveNodeBranch(cyclic, 1, 3, "manual")).toEqual({ ok: false, reason: "invalid-parent" });
  });
});

describe("transferNodeBranch", () => {
  const allocateIds: AllocateNodeIds = (occupied, count) => {
    let nextId = 100;
    return createNodeIdAllocator(() => () => nextId++).nextAvailableIds(occupied, count);
  };

  beforeEach(() => {
    const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
      "@/domain/nodes/nodeAutoLayout",
    );
    jest.mocked(layoutNodeForest).mockReset().mockImplementation(actual.layoutNodeForest);
  });

  it("IDは渡された採番で決まり、時計に依存しない", () => {
    const source = { layoutMode: "manual" as const, nodes: [node(1, null, 0, 0), node(2, 1, 300, 0)] };
    const target = { layoutMode: "manual" as const, nodes: [node(100, null, 0, 0)] };
    const nowSpy = jest.spyOn(Date, "now");

    const result = transferNodeBranch(source, target, 1, allocateIds);

    expect(nowSpy).not.toHaveBeenCalled();
    nowSpy.mockRestore();
    expect(result).toMatchObject({ ok: true, rootId: 101 });
    if (!result.ok) return;
    expect(result.target.nodes.map(({ id, parentId }) => [id, parentId])).toEqual([[100, null], [101, null], [102, 101]]);
  });

  it("衝突IDを再採番して全属性を保ち、移動先layoutを使う", () => {
    const source = { layoutMode: "manual" as const, nodes: [node(1, null, 0, 0), node(2, 1, 300, 0, { illustration: "img" })] };
    const target = { layoutMode: "auto" as const, nodes: [node(1, null, 10, 10)] };
    const result = transferNodeBranch(source, target, 1, allocateIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.nodes).toEqual([]);
    expect(result.source.layoutMode).toBe("manual");
    expect(result.target.layoutMode).toBe("auto");
    expect(new Set(result.target.nodes.map(({ id }) => id)).size).toBe(3);
    expect(result.rootId).not.toBe(1);
    expect(result.target.nodes.some(({ illustration }) => illustration === "img")).toBe(true);
    expect(result.target.nodes).toEqual(layoutNodeForest(result.target.nodes));
  });

  it("最後の枝を空に移し、targetのmanual layoutを保持する", () => {
    const source = { layoutMode: "auto" as const, nodes: layoutNodeForest([node(7, null, 0, 0)])! };
    const target = { layoutMode: "manual" as const, nodes: [] as Node[] };
    const result = transferNodeBranch(source, target, 7, allocateIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.nodes).toEqual([]);
    expect(result.target.layoutMode).toBe("manual");
    expect(result.target.nodes).toHaveLength(1);
  });

  it("元マップのautoで別の枝が残ると、そのforestを再配置する", () => {
    const source = {
      layoutMode: "auto" as const,
      nodes: [node(1, null, 999, 999), node(2, 1, 999, 999), node(3, null, 999, 999), node(4, 3, 999, 999)],
    };
    const target = { layoutMode: "manual" as const, nodes: [] as Node[] };
    const expectedRemainder = layoutNodeForest(source.nodes.filter(({ id }) => id === 3 || id === 4))!;

    const result = transferNodeBranch(source, target, 1, allocateIds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.nodes).toEqual(expectedRemainder);
    expect(result.source.nodes).not.toEqual(source.nodes.filter(({ id }) => id === 3 || id === 4));
  });

  it("移動先manualの配置不能では両入力を変えない", () => {
    const source = { layoutMode: "manual" as const, nodes: [node(1, null, 0, 0)] };
    const target = { layoutMode: "manual" as const, nodes: [node(2, null, 0, 1e308, { height: 1e308 })] };
    const sourceBefore = source.nodes;
    const targetBefore = target.nodes;

    expect(transferNodeBranch(source, target, 1, allocateIds)).toEqual({ ok: false, reason: "placement-failed" });
    expect(source.nodes).toBe(sourceBefore);
    expect(target.nodes).toBe(targetBefore);
    expect(source.nodes).toEqual([node(1, null, 0, 0)]);
    expect(target.nodes).toEqual([node(2, null, 0, 1e308, { height: 1e308 })]);
  });

  it("移動先autoの配置不能では両入力を変えない", () => {
    const source = { layoutMode: "manual" as const, nodes: [node(1, null, 0, 0)] };
    const target = { layoutMode: "auto" as const, nodes: [node(2, null, 0, 0)] };
    const sourceBefore = source.nodes;
    const targetBefore = target.nodes;
    const sourceSnapshot = source.nodes.map((item) => ({ ...item }));
    const targetSnapshot = target.nodes.map((item) => ({ ...item }));
    jest.mocked(layoutNodeForest).mockReturnValueOnce(null);

    expect(transferNodeBranch(source, target, 1, allocateIds)).toEqual({ ok: false, reason: "placement-failed" });
    expect(source.nodes).toBe(sourceBefore);
    expect(target.nodes).toBe(targetBefore);
    expect(source.nodes).toEqual(sourceSnapshot);
    expect(target.nodes).toEqual(targetSnapshot);
  });

  it("元マップautoの配置不能では移動先を計算せず両入力を変えない", () => {
    const source = { layoutMode: "auto" as const, nodes: [node(1, null, 0, 0), node(2, null, 0, 200)] };
    const target = { layoutMode: "manual" as const, nodes: [node(3, null, 0, 0)] };
    const sourceBefore = source.nodes;
    const targetBefore = target.nodes;
    const sourceSnapshot = source.nodes.map((item) => ({ ...item }));
    const targetSnapshot = target.nodes.map((item) => ({ ...item }));
    jest.mocked(layoutNodeForest).mockReturnValueOnce(null);

    expect(transferNodeBranch(source, target, 1, allocateIds)).toEqual({ ok: false, reason: "placement-failed" });
    expect(layoutNodeForest).toHaveBeenCalledTimes(1);
    expect(source.nodes).toBe(sourceBefore);
    expect(target.nodes).toBe(targetBefore);
    expect(source.nodes).toEqual(sourceSnapshot);
    expect(target.nodes).toEqual(targetSnapshot);
  });
});
