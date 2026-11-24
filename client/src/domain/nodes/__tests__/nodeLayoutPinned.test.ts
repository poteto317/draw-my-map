import {
  applySetNodeLayoutPinned,
  movePinnedNodeCoordinate,
} from "@/domain/nodes/nodeLayoutPinned";
import { createTestNode } from "@/testing/createTestNode";

describe("applySetNodeLayoutPinned", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, label: "b", layoutPinned: true }),
    createTestNode({ id: 3, label: "locked", locked: true }),
  ];

  it("付与・解除する", () => {
    const pinned = applySetNodeLayoutPinned(nodes, 1, true);
    expect(pinned.ok && pinned.nodes[0]?.layoutPinned).toBe(true);

    const unpinned = applySetNodeLayoutPinned(nodes, 2, false);
    expect(unpinned.ok && "layoutPinned" in unpinned.nodes[1]!).toBe(false);
  });

  it("locked / 欠落 / 無変更", () => {
    expect(applySetNodeLayoutPinned(nodes, 3, true)).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(applySetNodeLayoutPinned(nodes, 99, true)).toEqual({
      ok: false,
      reason: "node-missing",
    });
    expect(applySetNodeLayoutPinned(nodes, 2, true)).toEqual({
      ok: false,
      reason: "unchanged",
    });
  });
});

describe("movePinnedNodeCoordinate", () => {
  it("ピン単体だけ動かし子孫は動かさない", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r" }),
      createTestNode({ id: 2, parentId: 1, label: "p", x: 100, y: 100, layoutPinned: true }),
      createTestNode({ id: 3, parentId: 2, label: "c", x: 300, y: 100 }),
    ];
    const moved = movePinnedNodeCoordinate(nodes, 2, 100, 250)!;
    expect(moved.find((n) => n.id === 2)).toMatchObject({ x: 100, y: 250 });
    expect(moved.find((n) => n.id === 3)).toMatchObject({ x: 300, y: 100 });
  });

  it("非ピン・locked は null", () => {
    expect(movePinnedNodeCoordinate([
      createTestNode({ id: 1, label: "a" }),
    ], 1, 10, 10)).toBeNull();
    expect(movePinnedNodeCoordinate([
      createTestNode({ id: 1, label: "a", layoutPinned: true, locked: true }),
    ], 1, 10, 10)).toBeNull();
  });
});
