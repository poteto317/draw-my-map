import { isNodeContextMenuStale } from "@/components/map/nodeContextMenuStaleness";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2 })];
const fresh = {
  menuNodeId: 1,
  menuRevision: 0,
  resetRevision: 0,
  visibleNodeIds: new Set([1, 2]) as ReadonlySet<number>,
  nodes,
  menuViewport: { offsetX: 0, offsetY: 0, scale: 1 },
  viewport: { offsetX: 0, offsetY: 0, scale: 1 },
};

describe("isNodeContextMenuStale", () => {
  it("全条件を満たす間は失効しない", () => {
    expect(isNodeContextMenuStale(fresh)).toBe(false);
  });

  it("resetRevisionが開いた時点と異なると失効する", () => {
    expect(isNodeContextMenuStale({ ...fresh, resetRevision: 1 })).toBe(true);
  });

  it("対象ノードが非表示になると、nodesに残っていても失効する", () => {
    expect(isNodeContextMenuStale({ ...fresh, visibleNodeIds: new Set([2]) })).toBe(true);
  });

  it("対象ノードが削除されると、visibleNodeIdsに残っていても失効する", () => {
    expect(isNodeContextMenuStale({ ...fresh, nodes: [nodes[1]] })).toBe(true);
  });

  it("viewportのoffsetが開いた時点と異なると失効する", () => {
    expect(isNodeContextMenuStale({
      ...fresh,
      viewport: { offsetX: 10, offsetY: 0, scale: 1 },
    })).toBe(true);
    expect(isNodeContextMenuStale({
      ...fresh,
      viewport: { offsetX: 0, offsetY: 5, scale: 1 },
    })).toBe(true);
  });

  it("viewportのscaleが開いた時点と異なると失効する", () => {
    expect(isNodeContextMenuStale({
      ...fresh,
      viewport: { offsetX: 0, offsetY: 0, scale: 2 },
    })).toBe(true);
  });

  it("値が同じ新しいviewportオブジェクトでは失効しない", () => {
    expect(isNodeContextMenuStale({ ...fresh, viewport: { ...fresh.viewport } })).toBe(false);
  });
});
