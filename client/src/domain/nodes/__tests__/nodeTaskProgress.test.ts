import { collectTaskProgress } from "@/domain/nodes/nodeTaskProgress";
import { createTestNode } from "@/testing/createTestNode";

describe("枝のタスク進捗", () => {
  it("親自身と全子孫のタスクだけを数え、葉と別の空の枝は表示しない", () => {
    const result = collectTaskProgress([
      createTestNode({ id: 1, parentId: null, task: { completed: false } }),
      createTestNode({ id: 2, parentId: 1, task: { completed: true } }),
      createTestNode({ id: 3, parentId: 1 }),
      createTestNode({ id: 4, parentId: 3, task: { completed: false } }),
      createTestNode({ id: 5, parentId: null }),
      createTestNode({ id: 6, parentId: 5 }),
    ]);
    expect(result).toEqual(new Map([[1, { percent: 33, remaining: 2 }], [3, { percent: 0, remaining: 1 }]]));
  });

  it("深い枝を再帰なしで集計する", () => {
    const nodes = Array.from({ length: 10000 }, (_, i) => createTestNode({
      id: i + 1, parentId: i || null, ...(i === 9999 ? { task: { completed: true } } : {}),
    }));
    const result = collectTaskProgress(nodes);
    expect(result.size).toBe(9999);
    expect(result.get(1)).toEqual({ percent: 100, remaining: 0 });
  });

  it.each([
    [{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }],
    [{ id: 1, parentId: 2 }],
    [{ id: 1, parentId: null }, { id: 1, parentId: null }],
  ].map(nodes => [nodes] as const))("不正な枝を集計しない", nodes => {
    expect(collectTaskProgress(nodes.map(node => createTestNode({ ...node, task: { completed: true } })))).toEqual(new Map());
  });
});
