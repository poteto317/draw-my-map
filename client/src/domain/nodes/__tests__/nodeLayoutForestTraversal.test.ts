import type { NodeForestRelations } from "@/domain/nodes/nodeLayoutForestRelations";
import { traverseNodeForest } from "@/domain/nodes/nodeLayoutForestTraversal";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null): Node {
  return { id, parentId, x: id * 10, y: id * 20, width: 100, height: 60, label: String(id) , importance: "medium" as const};
}

function relations(
  nodes: readonly Node[],
  roots: readonly Node[],
  childrenByParent: ReadonlyMap<number, readonly Node[]>,
): NodeForestRelations {
  return { nodes, roots, childrenByParent };
}

describe("traverseNodeForest", () => {
  it("深さ・階層順・post-orderを返す", () => {
    const root = node(1, null);
    const secondRoot = node(9, null);
    const firstChild = node(2, 1);
    const secondChild = node(3, 1);
    const grandchild = node(4, 2);
    const traversal = traverseNodeForest(relations(
      [firstChild, root, secondChild, grandchild, secondRoot],
      [root, secondRoot],
      new Map([[1, [firstChild, secondChild]], [2, [grandchild]]]),
    ));

    expect(traversal?.depthById.get(4)).toBe(2);
    expect(traversal?.nodesByDepth.map((level) => level.map(({ id }) => id)))
      .toEqual([[1, 9], [2, 3], [4]]);
    expect(traversal?.postOrder.map(({ id }) => id)).toEqual([4, 2, 3, 1, 9]);
  });

  it("循環する関係を拒否する", () => {
    const first = node(1, null);
    const second = node(2, 1);
    const cyclicRelations = relations(
      [first, second],
      [first],
      new Map([[1, [second]], [2, [first]]]),
    );

    expect(traverseNodeForest(cyclicRelations)).toBeNull();
  });

  it("自己参照する関係を拒否する", () => {
    const self = node(1, 1);
    const selfRelations = relations([self], [], new Map([[1, [self]]]));

    expect(traverseNodeForest(selfRelations)).toBeNull();
  });

  it("正常なルートがあっても未到達の循環が残る関係を拒否する", () => {
    const root = node(1, null);
    const first = node(2, 3);
    const second = node(3, 2);
    const disconnectedRelations = relations(
      [root, first, second],
      [root],
      new Map([[2, [second]], [3, [first]]]),
    );

    expect(traverseNodeForest(disconnectedRelations)).toBeNull();
  });

  it("2,000階層を再帰せずに走査する", () => {
    const count = 2_000;
    const nodes = Array.from({ length: count }, (_, index) => {
      const id = index + 1;
      return node(id, id === 1 ? null : id - 1);
    });
    const childrenByParent = new Map<number, readonly Node[]>();
    for (const child of nodes.slice(1)) {
      childrenByParent.set(child.parentId!, [child]);
    }

    expect(traverseNodeForest(relations(nodes, [nodes[0]], childrenByParent))?.depthById.get(count))
      .toBe(count - 1);
  });
});
