import { resolvePinnedNodeDragCallbacks } from "@/domain/map/resolvePinnedNodeDragCallbacks";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, label: "a" }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200, layoutPinned: true }),
  createTestNode({ id: 3, parentId: 1, label: "locked", x: 200, y: 200, locked: true }),
];

describe("resolvePinnedNodeDragCallbacks (MapEditor→stage N6 配線)", () => {
  const guardBase = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    layoutMode: "auto" as const,
  };

  it("document 許可時はコールバックを渡し、移動は isPinnedNodeDragBlocked 経由", () => {
    const movePinnedNode = jest.fn(() => true);
    const finalizePinnedNodeMove = jest.fn(() => true);
    const { onMovePinnedNode, onFinalizePinnedNodeMove } = resolvePinnedNodeDragCallbacks({
      ...guardBase,
      nodes,
      movePinnedNode,
      finalizePinnedNodeMove,
    });

    expect(onMovePinnedNode).toBeDefined();
    expect(onFinalizePinnedNodeMove).toBe(finalizePinnedNodeMove);

    onMovePinnedNode!(2, 10, 20);
    expect(movePinnedNode).toHaveBeenCalledWith(2, 10, 20);

    movePinnedNode.mockClear();
    onMovePinnedNode!(1, 10, 20); // 非ピン → blocked
    expect(movePinnedNode).not.toHaveBeenCalled();

    onMovePinnedNode!(3, 10, 20); // locked → blocked
    expect(movePinnedNode).not.toHaveBeenCalled();
  });

  it("保護／競合／非ノード選択ではコールバック自体を外す", () => {
    const movePinnedNode = jest.fn(() => true);
    const finalizePinnedNodeMove = jest.fn(() => true);
    for (const override of [
      { isProtectedMode: true },
      { hasConflict: true },
      { canvasSelection: { type: "relation" as const, id: 1 } },
    ]) {
      const resolved = resolvePinnedNodeDragCallbacks({
        ...guardBase,
        ...override,
        nodes,
        movePinnedNode,
        finalizePinnedNodeMove,
      });
      expect(resolved.onMovePinnedNode).toBeUndefined();
      expect(resolved.onFinalizePinnedNodeMove).toBeUndefined();
    }
  });

  it("manual では移動コールバックを呼ばない（isPinnedNodeDragBlocked）", () => {
    const movePinnedNode = jest.fn(() => true);
    const { onMovePinnedNode } = resolvePinnedNodeDragCallbacks({
      ...guardBase,
      layoutMode: "manual",
      nodes,
      movePinnedNode,
      finalizePinnedNodeMove: jest.fn(() => true),
    });
    expect(onMovePinnedNode).toBeDefined();
    onMovePinnedNode!(2, 10, 20);
    expect(movePinnedNode).not.toHaveBeenCalled();
  });
});
