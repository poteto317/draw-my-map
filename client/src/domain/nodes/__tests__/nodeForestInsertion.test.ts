import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import {
  insertNodeForest,
  type ForestInsertionResult,
  type ForestItem,
} from "@/domain/nodes/nodeForestInsertion";
import { createChildNode } from "@/domain/nodes/nodePlacement";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function idsFrom(start: number) {
  return jest.fn<number[], [readonly Node[], number]>((_occupied, count) => (
    Array.from({ length: count }, (_, index) => start + index)
  ));
}

function deepFreeze<T extends object>(values: T[]): readonly T[] {
  values.forEach((value) => Object.freeze(value));
  return Object.freeze(values);
}

function item(label: string, parentIndex: number | null): ForestItem {
  return { label, parentIndex };
}

function expectSuccess(result: ForestInsertionResult): { nodes: Node[]; rootIds: number[] } {
  if (!result.ok) throw new Error(`挿入に失敗しました: ${result.reason}`);
  return result;
}

function findByLabel(nodes: readonly Node[], label: string): Node {
  const found = nodes.find((node) => node.label === label);
  if (!found) throw new Error(`ラベル ${label} のノードがありません。`);
  return found;
}

// A の子が A1・A2、B はルート
const twoTrees: ForestItem[] = [item("A", null), item("A1", 0), item("A2", 0), item("B", null)];

describe("insertNodeForest: 新しいルートとして追加", () => {
  it("manual・空のマップでは先頭のルートを (40, 40) に置き、寸法100×60・重要度mediumで追加する", () => {
    const allocateIds = idsFrom(1);
    const result = expectSuccess(
      insertNodeForest([], [item("A", null), item("A1", 0)], { kind: "root" }, "manual", allocateIds),
    );

    expect(result.rootIds).toEqual([1]);
    expect(result.nodes[0]).toEqual({
      id: 1, parentId: null, x: 40, y: 40, width: 100, height: 60, label: "A", importance: "medium",
    });
    expect(result.nodes[0]).not.toHaveProperty("illustration");
    expect(result.nodes[1]).toMatchObject({ id: 2, parentId: 1, x: 260, width: 100, height: 60, label: "A1" });
  });

  it("manual・既存のマップでは、木の上端がマップの下端から40px下に来るように森全体を真下へ移す", () => {
    const current = [
      createTestNode({ id: 1, x: 200, y: 240, height: 60 }),
      createTestNode({ id: 2, x: 80, y: 0, height: 60 }),
    ];
    const result = expectSuccess(
      insertNodeForest(current, twoTrees, { kind: "root" }, "manual", idsFrom(10)),
    );
    const added = result.nodes.slice(2);
    const a = findByLabel(added, "A");
    const a1 = findByLabel(added, "A1");
    const a2 = findByLabel(added, "A2");
    const b = findByLabel(added, "B");

    let minY = Infinity;
    for (const node of added) minY = Math.min(minY, node.y);
    expect(minY).toBe(340);
    expect(a1.y).toBe(340);
    expect(a.y).toBe(390);
    expect(a.x).toBe(80);
    expect(b.y).toBe(a2.y + a2.height + 80);
    expect(b.x).toBe(80);
  });

  it("auto ではすべて (40, 40) に置く（空のマップ・既存のマップ）", () => {
    const current = [createTestNode({ id: 1, x: 200, y: 240 })];
    for (const nodes of [[], current]) {
      const result = expectSuccess(
        insertNodeForest(nodes, twoTrees, { kind: "root" }, "auto", idsFrom(10)),
      );
      const added = result.nodes.slice(nodes.length);
      expect(added).toHaveLength(4);
      for (const node of added) {
        expect({ x: node.x, y: node.y, width: node.width, height: node.height }).toEqual({
          x: 40, y: 40, width: 100, height: 60,
        });
      }
    }
  });

  it("3本の木で rootIds が入力の順になり、子が正しい根につながる", () => {
    const items = [item("A", null), item("A1", 0), item("B", null), item("C", null), item("C1", 3)];
    for (const mode of ["manual", "auto"] as const) {
      const result = expectSuccess(
        insertNodeForest([], items, { kind: "root" }, mode, idsFrom(20)),
      );
      expect(result.rootIds).toEqual([20, 22, 23]);
      expect(result.nodes.map((node) => node.label)).toEqual(["A", "A1", "B", "C", "C1"]);
      expect(findByLabel(result.nodes, "A").parentId).toBeNull();
      expect(findByLabel(result.nodes, "B").parentId).toBeNull();
      expect(findByLabel(result.nodes, "C").parentId).toBeNull();
      expect(findByLabel(result.nodes, "A1").parentId).toBe(result.rootIds[0]);
      expect(findByLabel(result.nodes, "C1").parentId).toBe(result.rootIds[2]);
    }
  });

  it("current の後ろへ items の順で追加し、既存のノードはそのまま残す", () => {
    const current = [createTestNode({ id: 1, x: 0, y: 0 })];
    const result = expectSuccess(
      insertNodeForest(current, twoTrees, { kind: "root" }, "manual", idsFrom(10)),
    );
    expect(result.nodes[0]).toBe(current[0]);
    expect(result.nodes.slice(1).map((node) => node.id)).toEqual([10, 11, 12, 13]);
    expect(result.nodes.slice(1).map((node) => node.label)).toEqual(["A", "A1", "A2", "B"]);
  });
});

describe("insertNodeForest: 選択中のノードの子として追加", () => {
  it("manual・子が無い親では先頭の項目を (320, 50) に置き、2つ目の深さ0の項目を先頭の部分木の下端から40px下に置く", () => {
    const parent = createTestNode({ id: 1, x: 100, y: 50, width: 100, height: 60 });
    const result = expectSuccess(
      insertNodeForest([parent], twoTrees, { kind: "child", parentId: 1 }, "manual", idsFrom(10)),
    );
    const added = result.nodes.slice(1);
    const a = findByLabel(added, "A");
    const a2 = findByLabel(added, "A2");
    const b = findByLabel(added, "B");

    expect({ x: a.x, y: a.y }).toEqual({ x: 320, y: 50 });
    let subtreeBottom = -Infinity;
    for (const node of added) {
      if (node.label.startsWith("A")) subtreeBottom = Math.max(subtreeBottom, node.y + node.height);
    }
    expect(subtreeBottom).toBe(a2.y + a2.height);
    expect(b.y).toBe(subtreeBottom + 40);
    expect(b.x).toBe(320);
    expect(a.parentId).toBe(1);
    expect(b.parentId).toBe(1);
    expect(result.rootIds).toEqual([10, 13]);
  });

  it("manual・既存の子がある親では、先頭の項目を createChildNode と同じ位置に置く", () => {
    const current = [
      createTestNode({ id: 1, x: 100, y: 50, width: 100, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 320, y: 170, height: 60 }),
      createTestNode({ id: 3, parentId: 1, x: 320, y: 110, height: 60 }),
    ];
    const result = expectSuccess(
      insertNodeForest(current, twoTrees, { kind: "child", parentId: 1 }, "manual", idsFrom(10)),
    );
    const a = findByLabel(result.nodes.slice(3), "A");
    const expected = createChildNode(current, 1, 999)!;

    expect(a.y).toBe(270);
    expect({ x: a.x, y: a.y }).toEqual({ x: expected.x, y: expected.y });
    expect(findByLabel(result.nodes, "B").parentId).toBe(1);
  });

  it("auto ではすべて (40, 40) に置き、深さ0の項目を親につなぐ", () => {
    const parent = createTestNode({ id: 1, x: 100, y: 50 });
    const result = expectSuccess(
      insertNodeForest([parent], twoTrees, { kind: "child", parentId: 1 }, "auto", idsFrom(10)),
    );
    const added = result.nodes.slice(1);
    for (const node of added) expect({ x: node.x, y: node.y }).toEqual({ x: 40, y: 40 });
    expect(added.map((node) => node.parentId)).toEqual([1, 10, 10, 1]);
    expect(result.rootIds).toEqual([10, 13]);
  });
});

describe("insertNodeForest: 失敗と採番", () => {
  it("成功時に allocateIds を1回だけ (current, items.length) で呼ぶ", () => {
    const current = [createTestNode({ id: 1 })];
    const allocateIds = idsFrom(10);
    insertNodeForest(current, twoTrees, { kind: "root" }, "manual", allocateIds);
    expect(allocateIds).toHaveBeenCalledTimes(1);
    expect(allocateIds).toHaveBeenCalledWith(current, 4);
  });

  it.each<[string, ForestItem[]]>([
    ["空", []],
    ["先頭の parentIndex が null でない", [item("A", 0)]],
    ["parentIndex が整数でない", [item("A", null), item("B", 0), item("C", 1.5)]],
    ["parentIndex が負", [item("A", null), item("B", -1)]],
    ["parentIndex が自分自身", [item("A", null), item("B", 1)]],
    ["parentIndex が自分より後", [item("A", null), item("B", 2), item("C", 0)]],
  ])("項目が不正（%s）なら invalid-items で、allocateIds を呼ばない", (_name, items) => {
    for (const mode of ["manual", "auto"] as const) {
      const allocateIds = idsFrom(10);
      expect(insertNodeForest([], items, { kind: "root" }, mode, allocateIds)).toEqual({
        ok: false, reason: "invalid-items",
      });
      expect(allocateIds).not.toHaveBeenCalled();
    }
  });

  it("項目の検査を親の存在の検査より先に行う", () => {
    const allocateIds = idsFrom(10);
    expect(insertNodeForest([], [], { kind: "child", parentId: 1 }, "manual", allocateIds)).toEqual({
      ok: false, reason: "invalid-items",
    });
  });

  it("親が無ければ parent-missing で、allocateIds を呼ばない", () => {
    const current = [createTestNode({ id: 1 })];
    for (const mode of ["manual", "auto"] as const) {
      const allocateIds = idsFrom(10);
      expect(insertNodeForest(current, twoTrees, { kind: "child", parentId: 99 }, mode, allocateIds))
        .toEqual({ ok: false, reason: "parent-missing" });
      expect(allocateIds).not.toHaveBeenCalled();
    }
  });

  it("root・manual で既存のノードの下端が Number.MAX_VALUE 付近なら placement-failed で、allocateIds を呼ばない", () => {
    const current = [createTestNode({ id: 1, y: Number.MAX_VALUE, height: 60 })];
    const allocateIds = idsFrom(10);
    expect(insertNodeForest(current, twoTrees, { kind: "root" }, "manual", allocateIds)).toEqual({
      ok: false, reason: "placement-failed",
    });
    expect(allocateIds).not.toHaveBeenCalled();
  });

  it("child・manual で親の x が Number.MAX_VALUE なら placement-failed で、allocateIds を呼ばない", () => {
    const current = [createTestNode({ id: 1, x: Number.MAX_VALUE, y: 0 })];
    const allocateIds = idsFrom(10);
    expect(insertNodeForest(current, twoTrees, { kind: "child", parentId: 1 }, "manual", allocateIds))
      .toEqual({ ok: false, reason: "placement-failed" });
    expect(allocateIds).not.toHaveBeenCalled();
  });

  it("同じ値を繰り返す生成器の allocator でも、既存の ID とも互いにも重ならない ID を割り当てる", () => {
    const allocator = createNodeIdAllocator(() => {
      const values = [1, 1, 2, 2, 3, 3, 4, 4, 5];
      let index = 0;
      return () => values[index++];
    });
    const current = [createTestNode({ id: 1 })];
    const items = [item("A", null), item("A1", 0), item("B", null)];
    const result = expectSuccess(
      insertNodeForest(current, items, { kind: "root" }, "manual", allocator.nextAvailableIds),
    );
    expect(result.nodes.slice(1).map((node) => node.id)).toEqual([2, 3, 4]);
    expect(new Set(result.nodes.map((node) => node.id)).size).toBe(4);
    expect(result.nodes[2].parentId).toBe(2);
    expect(result.rootIds).toEqual([2, 4]);
  });

  it("freeze した current と items を変更しない", () => {
    const current = deepFreeze([
      createTestNode({ id: 1, x: 100, y: 50 }),
      createTestNode({ id: 2, parentId: 1, x: 320, y: 50 }),
    ]);
    const items = deepFreeze(twoTrees.map((value) => ({ ...value })));
    const targets = [{ kind: "root" } as const, { kind: "child", parentId: 1 } as const];
    for (const target of targets) {
      for (const mode of ["manual", "auto"] as const) {
        expect(() => insertNodeForest(current, items, target, mode, idsFrom(10))).not.toThrow();
        expect(insertNodeForest(current, items, target, mode, idsFrom(10)).ok).toBe(true);
      }
    }
  });
});

describe("insertNodeForest: 計算量", () => {
  const itemCount = 10_000;
  const currentCount = 1_000;
  const chain: ForestItem[] = Array.from({ length: itemCount }, (_, index) => (
    item(`鎖${index}`, index === 0 ? null : index - 1)
  ));
  const siblings: ForestItem[] = Array.from({ length: itemCount }, (_, index) => (
    item(`兄弟${index}`, null)
  ));
  const current: Node[] = Array.from({ length: currentCount }, (_, index) => (
    createTestNode({ id: index + 1, parentId: index === 0 ? null : 1, x: 320, y: index * 100 })
  ));

  function observe<T>(values: T[]): { proxy: T[]; reads: () => number } {
    let count = 0;
    const proxy = new Proxy(values, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) count += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    return { proxy, reads: () => count };
  }

  const cases = [
    ["manual・root", "manual", { kind: "root" }],
    ["manual・child", "manual", { kind: "child", parentId: 1 }],
    ["auto", "auto", { kind: "root" }],
  ] as const;

  describe.each(cases)("%s", (_name, mode, target) => {
    it.each([["10,000段の鎖", chain], ["10,000件の兄弟", siblings]] as const)(
      "%s で配列要素の読み取り回数が件数の20倍以内",
      (_kind, items) => {
        const observedCurrent = observe(current);
        const observedItems = observe([...items]);
        const result = expectSuccess(insertNodeForest(
          observedCurrent.proxy,
          observedItems.proxy,
          target,
          mode,
          createNodeIdAllocator().nextAvailableIds,
        ));
        expect(result.nodes).toHaveLength(currentCount + itemCount);
        expect(observedCurrent.reads()).toBeLessThanOrEqual(currentCount * 20);
        expect(observedItems.reads()).toBeLessThanOrEqual(itemCount * 20);
      },
    );
  });
});
