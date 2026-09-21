import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import type { Node } from "@/types/node";

function node(id: number): Node {
  return {
    id,
    parentId: null,
    x: 0,
    y: 0,
    width: 160,
    height: 64,
    label: `node-${id}`,
  };
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
});
