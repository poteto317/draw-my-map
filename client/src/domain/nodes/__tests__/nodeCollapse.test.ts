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

  it.each([
    ["広い木", wideTreeNodes(4_000), [1]],
    ["深い鎖", chainNodes(4_000), [1_000, 2_000, 3_000]],
  ] as const)("%sの導出で索引の全フィールドを線形回数だけ読み取る", (_name, nodes, collapsed) => {
    const index = createNodeCollapseIndex(nodes)!;
    const reads = { count: 0 };

    const derived = deriveNodeCollapse(observeIndexReads(index, reads), new Set(collapsed));

    expect(derived.visibleNodeIds.size).toBe(deriveNodeCollapse(index, new Set(collapsed)).visibleNodeIds.size);
    expect(reads.count).toBeGreaterThan(0);
    expect(reads.count).toBeLessThanOrEqual(nodes.length * 6);
  });
});

function wideTreeNodes(count: number): Node[] {
  return [
    node(1, null),
    ...Array.from({ length: count - 1 }, (_, index) => node(index + 2, 1)),
  ];
}

function chainNodes(count: number): Node[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return node(id, id === 1 ? null : id - 1);
  });
}

type ReadCounter = { count: number };

const COUNTED_COLLECTION_METHODS = new Set<PropertyKey>([
  "get", "has", "values", "entries", "keys", "forEach", Symbol.iterator,
]);

/** 索引の全フィールド（Map・Set・配列）の読み取りを、要素1件ごとに数える。 */
function observeIndexReads(index: NodeCollapseIndex, reads: ReadCounter): NodeCollapseIndex {
  return Object.fromEntries(
    Object.entries(index).map(([key, value]) => [key, observeReads(value, reads)]),
  ) as NodeCollapseIndex;
}

function observeReads<T>(value: T, reads: ReadCounter): T {
  if (Array.isArray(value)) return observeArrayReads(value, reads) as T;
  if (value instanceof Map || value instanceof Set) {
    return observeCollectionReads(value, reads) as T;
  }
  return value;
}

function observeArrayReads<T>(array: readonly T[], reads: ReadCounter): readonly T[] {
  return new Proxy(array, {
    get(target, property, receiver) {
      // 配列の反復・map・添字はいずれも受け手経由の添字読み取りになる。
      if (typeof property === "string" && /^\d+$/.test(property)) reads.count += 1;
      return Reflect.get(target, property, receiver);
    },
  });
}

function countIteration<T>(iterator: Iterator<T>, reads: ReadCounter): IterableIterator<T> {
  return {
    next() {
      const result = iterator.next();
      if (!result.done) reads.count += 1;
      return result;
    },
    [Symbol.iterator]() { return this; },
  };
}

function observeCollectionReads(
  collection: Map<unknown, unknown> | Set<unknown>,
  reads: ReadCounter,
): Map<unknown, unknown> | Set<unknown> {
  return new Proxy(collection, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      const method = (value as (...args: unknown[]) => unknown).bind(target);
      if (!COUNTED_COLLECTION_METHODS.has(property)) return method;
      if (property === "get") {
        return (key: unknown) => {
          reads.count += 1;
          return observeReads(method(key), reads);
        };
      }
      if (property === "has") {
        return (key: unknown) => {
          reads.count += 1;
          return method(key);
        };
      }
      if (property === "forEach") {
        return (callback: (...args: unknown[]) => void) => method((...args: unknown[]) => {
          reads.count += 1;
          callback(...args);
        });
      }
      return () => countIteration(method() as Iterator<unknown>, reads);
    },
  });
}
