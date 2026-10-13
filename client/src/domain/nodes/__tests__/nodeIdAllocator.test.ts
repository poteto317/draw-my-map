import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number): Node {
  return createTestNode({ id, width: 160, height: 64, label: `node-${id}` });
}

function generatorFrom(values: number[]): () => number {
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error("テスト用IDが不足しています。");
    return value;
  };
}

describe("createNodeIdAllocator", () => {
  it("使用中IDを飛ばして次の空きIDを返し入力を変更しない", () => {
    const allocator = createNodeIdAllocator(() => (
      generatorFrom([1_000, 1_001, 1_002, 1_003, 1_004])
    ));
    const nodes = [node(1_000), node(1_001), node(1_003)];
    const before = nodes.map((current) => ({ ...current }));

    const firstId = allocator.nextAvailableId(nodes);
    const secondId = allocator.nextAvailableId([...nodes, node(firstId)]);

    expect([firstId, secondId]).toEqual([1_002, 1_004]);
    expect(nodes).toEqual(before);
  });

  it("リセット後は新しいID生成器を使用する", () => {
    const sequences = [[5_000], [1_000, 1_001, 1_002]];
    let createdGeneratorCount = 0;
    const allocator = createNodeIdAllocator(() => {
      const values = sequences[createdGeneratorCount];
      createdGeneratorCount += 1;
      if (!values) throw new Error("テスト用生成器が不足しています。");
      return generatorFrom([...values]);
    });

    expect(allocator.nextAvailableId([])).toBe(5_000);
    allocator.reset();

    expect(allocator.nextAvailableId([node(1_000), node(1_001)])).toBe(1_002);
    expect(createdGeneratorCount).toBe(2);
  });

  it("既存IDを飛ばして互いに異なるIDをcount個まとめて返し入力を変更しない", () => {
    const allocator = createNodeIdAllocator(() => (
      generatorFrom([1_000, 1_001, 1_002, 1_003, 1_004, 1_005])
    ));
    const nodes = [node(1_000), node(1_002), node(1_003)];
    const before = nodes.map((current) => ({ ...current }));

    expect(allocator.nextAvailableIds(nodes, 2)).toEqual([1_001, 1_004]);
    expect(nodes).toEqual(before);
  });

  it("生成器が同じ値を返しても一括採番のID同士は重ならない", () => {
    const allocator = createNodeIdAllocator(() => generatorFrom([5, 5, 6]));

    expect(allocator.nextAvailableIds([], 2)).toEqual([5, 6]);
  });

  it("countが0なら生成器を進めず空配列を返す", () => {
    const allocator = createNodeIdAllocator(() => generatorFrom([1_000]));

    expect(allocator.nextAvailableIds([], 0)).toEqual([]);
    expect(allocator.nextAvailableId([])).toBe(1_000);
  });

  it("一括採番後も生成器は単調増加を続け直後の単独採番と重ならない", () => {
    const allocator = createNodeIdAllocator(() => (
      generatorFrom([1_000, 1_001, 1_002, 1_003])
    ));

    const ids = allocator.nextAvailableIds([node(1_001)], 2);
    const nextId = allocator.nextAvailableId([node(1_001)]);

    expect(ids).toEqual([1_000, 1_002]);
    expect(nextId).toBe(1_003);
  });

  it("一括採番は既存ノード配列をcountに比例して繰り返し走査しない（1件ずつ採番するO(n·count)への退行を検出する）", () => {
    let current = 0;
    const allocator = createNodeIdAllocator(() => () => {
      current += 1;
      return current;
    });
    const nodeCount = 2_000;
    const count = 1_000;
    const nodes = Array.from({ length: nodeCount }, (_, index) => node(index * 2 + 1));
    let elementReads = 0;
    let idReads = 0;
    const observedElements = nodes.map((target) => new Proxy(target, {
      get(innerTarget, property, receiver) {
        if (property === "id") idReads += 1;
        return Reflect.get(innerTarget, property, receiver);
      },
    }));
    const observedNodes = new Proxy(observedElements, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) elementReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const ids = allocator.nextAvailableIds(observedNodes, count);

    expect(ids).toHaveLength(count);
    expect(new Set(ids).size).toBe(count);
    const occupiedIds = new Set(nodes.map((existing) => existing.id));
    expect(ids.some((id) => occupiedIds.has(id))).toBe(false);
    expect(elementReads).toBeLessThanOrEqual(nodeCount * 2);
    expect(idReads).toBeLessThanOrEqual(nodeCount * 2);
  });
});
