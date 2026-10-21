import { projectCollapsedLayout } from "@/domain/nodes/nodeCollapseLayout";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({
    id,
    parentId,
    x: id * 100,
    y: id * 100,
    width: 100,
    height: 60,
    label: `node-${id}`,
    ...overrides,
  });
}

describe("projectCollapsedLayout", () => {
  it.each([
    ["manual", new Set([1])],
    ["auto", new Set([1, 2])],
  ] as const)(
    "%sで再配置が不要なら元のnodes参照を返す",
    (mode, collapseVisibleNodeIds) => {
      const nodes = [node(1, null), node(2, 1)];

      const result = projectCollapsedLayout(nodes, mode, collapseVisibleNodeIds);

      expect(result).toEqual({ nodes, layoutFailed: false });
      expect(result.nodes).toBe(nodes);
    },
  );

  it("auto折りたたみでは可視兄弟の空白を詰め、全IDと入力順を保つ", () => {
    const nodes = layoutNodeForest([
      node(1, null, { x: 40, y: 80 }),
      node(2, 1),
      node(3, 2, { height: 300 }),
      node(4, 1),
    ])!;
    const expandedSiblingGap = nodes[3].y - (nodes[1].y + nodes[1].height);

    const result = projectCollapsedLayout(nodes, "auto", new Set([1, 2, 4]));

    expect(result.layoutFailed).toBe(false);
    expect(result.nodes.map(({ id }) => id)).toEqual([1, 2, 3, 4]);
    const collapsedSiblingGap = result.nodes[3].y - (result.nodes[1].y + result.nodes[1].height);
    expect(collapsedSiblingGap).toBeLessThan(expandedSiblingGap);
  });

  it("表示ノードだけに投影座標を合成し、正本とhiddenノードを変更しない", () => {
    const nodes = [node(1, null, { x: 40, y: 80 }), node(2, 1), node(3, 2), node(4, 1)];
    const before = nodes.map((current) => ({ ...current }));

    const result = projectCollapsedLayout(nodes, "auto", new Set([1, 2, 4]));

    expect(result.nodes).not.toBe(nodes);
    expect(result.nodes[2]).toBe(nodes[2]);
    expect(result.nodes[2]).toEqual(before[2]);
    expect(nodes).toEqual(before);
  });

  it("同じ入力では同じ表示座標を返す", () => {
    const nodes = [node(1, null, { x: 40, y: 80 }), node(2, 1), node(3, 2), node(4, 1)];
    const visible = new Set([1, 2, 4]);

    expect(projectCollapsedLayout(nodes, "auto", visible).nodes)
      .toEqual(projectCollapsedLayout(nodes, "auto", visible).nodes);
  });

  it("可視部分の配置に失敗した場合は正本nodesへfallbackして失敗を返す", () => {
    const nodes = [
      node(1, null, { y: 2 ** 57 }),
      node(2, 1),
      node(3, 1),
      node(4, 1),
    ];

    const result = projectCollapsedLayout(nodes, "auto", new Set([1, 2, 3]));

    expect(result).toEqual({ nodes, layoutFailed: true });
    expect(result.nodes).toBe(nodes);
  });

  it("10,000階層の直線木の中間を閉じても再帰エラーなく可視部分だけを再配置する", () => {
    const count = 10_000;
    const nodes = Array.from({ length: count }, (_, index) => node(index + 1, index === 0 ? null : index));
    const visibleIds = new Set(nodes.slice(0, 5_000).map((item) => item.id));

    const result = projectCollapsedLayout(nodes, "auto", visibleIds);

    expect(result.layoutFailed).toBe(false);
    expect(result.nodes).toHaveLength(count);
    expect(result.nodes.map((item) => item.id)).toEqual(nodes.map((item) => item.id));
    expect(result.nodes.slice(0, 5_000)).toEqual(layoutNodeForest(nodes.slice(0, 5_000)));
    expect(result.nodes[5_000]).toBe(nodes[5_000]);
    expect(result.nodes[count - 1]).toBe(nodes[count - 1]);
  });
});
