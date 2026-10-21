import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { createTestNode } from "@/testing/createTestNode";
import { resolveNodeSearchReveal } from "../nodeSearchReveal";
const index = createNodeCollapseIndex([
  createTestNode({ id: 1 }), createTestNode({ id: 2, parentId: 1 }),
  createTestNode({ id: 3, parentId: 2, importance: "low" }), createTestNode({ id: 4, parentId: 3 }),
  createTestNode({ id: 5 }), createTestNode({ id: 6, parentId: 5 }),
]);
describe("resolveNodeSearchReveal", () => {
  it.each([
    [[1, 2, 3, 5], [3], [2, 1], null],
    [[1, 2, 3, 5], [], [2, 1], "all"],
    [[3, 5], [], [], "all"],
    [[3, 5], [3], [], null],
  ] as const)("閉じた祖先とRから変更を決定する: %j / %j", (collapsed, visible, ancestors, level) => {
    const collapsedNodeIds = new Set<number>(collapsed);
    expect(resolveNodeSearchReveal({ index, collapsedNodeIds, resolutionVisibleNodeIds: new Set<number>(visible), nodeId: 3 })).toEqual({ ancestorIdsToExpand: ancestors, resolutionLevel: level });
    expect([...collapsedNodeIds]).toEqual(collapsed);
  });
  it("対象不在と不正indexは解決しない", () => {
    const params = { collapsedNodeIds: new Set([1]), resolutionVisibleNodeIds: new Set<number>(), nodeId: 99 };
    expect(resolveNodeSearchReveal({ ...params, index })).toBeNull();
    expect(resolveNodeSearchReveal({ ...params, index: null, nodeId: 3 })).toBeNull();
  });
  it("10,000階層の末端でも再帰エラーなく閉じた厳密な祖先だけを返す", () => {
    const count = 10_000;
    const deepIndex = createNodeCollapseIndex(Array.from({ length: count }, (_, i) => (
      createTestNode({ id: i + 1, parentId: i === 0 ? null : i })
    )));
    const collapsedNodeIds = new Set([2, 5_000, 9_999, count]);
    const reveal = resolveNodeSearchReveal({
      index: deepIndex, collapsedNodeIds, resolutionVisibleNodeIds: new Set([count]), nodeId: count,
    });
    expect(reveal).toEqual({ ancestorIdsToExpand: [9_999, 5_000, 2], resolutionLevel: null });
  });
});
