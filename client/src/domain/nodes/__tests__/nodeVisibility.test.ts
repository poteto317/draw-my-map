import { collectVisibleNodeIds } from "@/domain/nodes/nodeVisibility";
import { createTestNode } from "@/testing/createTestNode";

describe("node visibility", () => {
  it("条件を満たす孫と祖先だけを表示する", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null, importance: "low" }),
      createTestNode({ id: 2, parentId: 1, importance: "low" }),
      createTestNode({ id: 3, parentId: 2, importance: "high" }),
      createTestNode({ id: 4, parentId: 1, importance: "low" }),
    ];

    expect([...collectVisibleNodeIds(nodes, "high")]).toEqual([1, 2, 3]);
  });

  it("同じ親を共有する高重要度ノードだけを表示する", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null, importance: "high" }),
      createTestNode({ id: 2, parentId: 1, importance: "high" }),
      createTestNode({ id: 3, parentId: 1, importance: "medium" }),
      createTestNode({ id: 4, parentId: 1, importance: "low" }),
    ];

    expect([...collectVisibleNodeIds(nodes, "high")]).toEqual([1, 2]);
  });

  it("mediumでは高・中重要度の兄弟を表示する", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null, importance: "high" }),
      createTestNode({ id: 2, parentId: 1, importance: "high" }),
      createTestNode({ id: 3, parentId: 1, importance: "medium" }),
      createTestNode({ id: 4, parentId: 1, importance: "low" }),
    ];

    expect([...collectVisibleNodeIds(nodes, "medium")]).toEqual([1, 2, 3]);
  });

  it("allでは重要度にかかわらず全ノードを表示する", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null, importance: "high" }),
      createTestNode({ id: 2, parentId: 1, importance: "medium" }),
      createTestNode({ id: 3, parentId: 1, importance: "low" }),
    ];

    expect([...collectVisibleNodeIds(nodes, "all")]).toEqual([1, 2, 3]);
  });

  it("配列後方にある親でも入力順で祖先を含める", () => {
    const nodes = [
      createTestNode({ id: 3, parentId: 2, importance: "high" }),
      createTestNode({ id: 1, parentId: null, importance: "low" }),
      createTestNode({ id: 2, parentId: 1, importance: "low" }),
    ];

    expect([...collectVisibleNodeIds(nodes, "high")]).toEqual([3, 1, 2]);
  });

  it("10,000ノードの連鎖でも祖先をすべて返す", () => {
    const nodes = Array.from({ length: 10_000 }, (_, index) => (
      createTestNode({
        id: index + 1,
        parentId: index === 0 ? null : index,
        importance: index === 9_999 ? "high" : "low",
      })
    ));

    const visibleNodeIds = collectVisibleNodeIds(nodes, "high");

    expect(visibleNodeIds.size).toBe(10_000);
    expect([...visibleNodeIds]).toEqual(nodes.map((node) => node.id));
  });

  it("全mediumの10,000ノード連鎖で処理済み祖先を再走査しない", () => {
    let parentIdReads = 0;
    const nodes = Array.from({ length: 10_000 }, (_, index) => {
      const node = createTestNode({
        id: index + 1,
        parentId: index === 0 ? null : index,
        importance: "medium",
      });
      const parentId = node.parentId;
      Object.defineProperty(node, "parentId", {
        enumerable: true,
        get: () => {
          parentIdReads += 1;
          return parentId;
        },
      });
      return node;
    });

    const visibleNodeIds = collectVisibleNodeIds(nodes, "all");

    expect(visibleNodeIds.size).toBe(10_000);
    expect([...visibleNodeIds]).toEqual(nodes.map((node) => node.id));
    expect(parentIdReads).toBeLessThanOrEqual(nodes.length);
  });

  it("欠損親参照、自己参照、循環があっても停止する", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: 999, importance: "high" }),
      createTestNode({ id: 2, parentId: 2, importance: "high" }),
      createTestNode({ id: 3, parentId: 4, importance: "high" }),
      createTestNode({ id: 4, parentId: 3, importance: "low" }),
    ];

    expect(() => collectVisibleNodeIds(nodes, "high")).not.toThrow();
    expect([...collectVisibleNodeIds(nodes, "high")]).toEqual([1, 2, 3, 4]);
  });
});
