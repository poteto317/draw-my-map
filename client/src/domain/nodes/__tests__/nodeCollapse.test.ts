import {
  canCollapse,
  collectAncestorIds,
  createNodeCollapseIndex,
  deriveNodeCollapse,
  expandCollapsedNodes,
  normalizeCollapsedNodeIds,
  toggleCollapsedNode,
  type NodeCollapseIndex,
} from "@/domain/nodes/nodeCollapse";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null): Node {
  return createTestNode({ id, parentId, label: String(id) });
}

function ids(values: ReadonlySet<number>): number[] {
  return [...values];
}

describe("nodeCollapse", () => {
  const nestedNodes = Object.freeze([
    node(3, 2), node(1, null), node(4, 1), node(2, 1),
  ]);

  it("forest検証を再利用して入力順の索引と子孫数を構築する", () => {
    const index = createNodeCollapseIndex(nestedNodes);

    expect(index?.roots.map(({ id }) => id)).toEqual([1]);
    expect(index?.nodesById.get(3)?.label).toBe("3");
    expect([...index!.parentById]).toEqual([[3, 2], [1, null], [4, 1], [2, 1]]);
    expect(index?.childrenByParent.get(1)?.map(({ id }) => id)).toEqual([4, 2]);
    expect(index?.descendantCountById.get(3)).toBe(0);
    expect(index?.descendantCountById.get(4)).toBe(0);
    expect(index?.descendantCountById.get(2)).toBe(1);
    expect(index?.descendantCountById.get(1)).toBe(3);
  });

  it.each([
    ["重複ID", [node(1, null), node(1, null)]],
    ["孤児", [node(1, 99)]],
    ["循環", [node(1, 2), node(2, 1)]],
  ])("%sを拒否する", (_name, nodes) => {
    expect(createNodeCollapseIndex(nodes)).toBeNull();
  });

  it("入れ子の折りたたみを保持し外側展開後も内側の子孫を隠す", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const derived = deriveNodeCollapse(index, new Set([1, 2]));

    expect(ids(derived.collapsedNodeIds)).toEqual([1, 2]);
    expect(ids(derived.visibleNodeIds)).toEqual([1]);
    expect([...derived.hiddenCountById]).toEqual([[1, 3], [2, 1]]);

    const expanded = toggleCollapsedNode(index, derived.collapsedNodeIds, 1);
    const afterExpansion = deriveNodeCollapse(index, expanded);
    expect(ids(afterExpansion.collapsedNodeIds)).toEqual([2]);
    expect(ids(afterExpansion.visibleNodeIds)).toEqual([1, 4, 2]);
    expect([...afterExpansion.hiddenCountById]).toEqual([[2, 1]]);
  });

  it("不在IDと葉を折りたたみ集合と件数から除外する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const derived = deriveNodeCollapse(index, new Set([999, 3, 2]));

    expect(ids(derived.collapsedNodeIds)).toEqual([2]);
    expect(ids(derived.visibleNodeIds)).toEqual([1, 4, 2]);
    expect([...derived.hiddenCountById]).toEqual([[2, 1]]);
  });

  it("子を持つ実在ノードだけを折りたたみ対象と判定する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;

    expect(canCollapse(index, 1)).toBe(true);
    expect(canCollapse(index, 2)).toBe(true);
    expect(canCollapse(index, 3)).toBe(false);
    expect(canCollapse(index, 999)).toBe(false);
  });

  it("正規化は不在IDと葉を除き、入れ子の有効IDを入力を変えずに保持する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const current = new Set([999, 3, 2, 1]);
    Object.freeze(current);

    const normalized = normalizeCollapsedNodeIds(index, current);

    expect(ids(normalized)).toEqual([2, 1]);
    expect(normalized).not.toBe(current);
    expect(ids(current)).toEqual([999, 3, 2, 1]);
  });

  it("正規化は有効集合と空集合なら元の参照を返す", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const valid = new Set([1, 2]);
    const empty = new Set<number>();

    expect(normalizeCollapsedNodeIds(index, valid)).toBe(valid);
    expect(normalizeCollapsedNodeIds(index, empty)).toBe(empty);
  });

  it("正規化は木を走査せず閉ID数だけ子孫数を参照する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    let countReads = 0;
    const forbidden = () => {
      throw new Error("正規化で木を走査してはいけない");
    };
    const observed = {
      get nodesById() { return forbidden(); },
      get parentById() { return forbidden(); },
      get childrenByParent() { return forbidden(); },
      get roots() { return forbidden(); },
      descendantCountById: {
        get(key: number) {
          countReads += 1;
          return index.descendantCountById.get(key);
        },
      },
    } as unknown as NodeCollapseIndex;

    expect(ids(normalizeCollapsedNodeIds(observed, new Set([999, 3, 2])))).toEqual([2]);
    expect(countReads).toBe(3);
  });

  it("祖先を親から根の順で返し不在IDを拒否する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;

    expect(collectAncestorIds(index, 3)).toEqual([2, 1]);
    expect(collectAncestorIds(index, 1)).toEqual([]);
    expect(collectAncestorIds(index, 999)).toBeNull();
  });

  it("toggleは入力を変更せず葉・不在IDを無視する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const current = new Set([1, 2]);
    Object.freeze(current);

    expect(ids(toggleCollapsedNode(index, current, 2))).toEqual([1]);
    expect(toggleCollapsedNode(index, current, 3)).toBe(current);
    expect(toggleCollapsedNode(index, current, 999)).toBe(current);
    expect(ids(current)).toEqual([1, 2]);
  });

  it("一括展開は入力を変更せず閉じていないIDを無視する", () => {
    const current = new Set([1, 2]);
    Object.freeze(current);

    expect(ids(expandCollapsedNodes(current, [1, 999]))).toEqual([2]);
    expect(ids(current)).toEqual([1, 2]);
  });

  it("10,000階層を再帰せず索引化し可視性と祖先を導出する", () => {
    const count = 10_000;
    const nodes = Array.from({ length: count }, (_, index) => {
      const id = index + 1;
      return node(id, id === 1 ? null : id - 1);
    });

    const index = createNodeCollapseIndex(nodes)!;
    const derived = deriveNodeCollapse(index, new Set([5_000]));

    expect(index.descendantCountById.get(1)).toBe(9_999);
    expect(index.descendantCountById.get(5_000)).toBe(5_000);
    expect(derived.visibleNodeIds.size).toBe(5_000);
    expect(derived.visibleNodeIds.has(5_001)).toBe(false);
    expect(collectAncestorIds(index, count)?.length).toBe(9_999);
  });

  it("広い木の導出で索引を線形回数だけ読み取る", () => {
    const count = 4_000;
    const index = createNodeCollapseIndex([
      node(1, null),
      ...Array.from({ length: count - 1 }, (_, index) => node(index + 2, 1)),
    ])!;
    const reads = { nodes: 0, children: 0 };
    const observed: NodeCollapseIndex = {
      ...index,
      nodesById: new Proxy(index.nodesById, {
        get(target, property) {
          if (property === "values") {
            return () => {
              reads.nodes += target.size;
              return target.values();
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
      childrenByParent: new Proxy(index.childrenByParent, {
        get(target, property) {
          if (property === "get") {
            return (key: number) => {
              reads.children += 1;
              return target.get(key);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    };

    const derived = deriveNodeCollapse(observed, new Set([1]));

    expect(derived.visibleNodeIds.size).toBe(1);
    expect(derived.hiddenCountById.get(1)).toBe(count - 1);
    expect(reads.nodes + reads.children).toBeLessThanOrEqual(count * 3);
  });
});
