import {
  calculateCenteringOffset,
  calculateChildFrames,
  extentFromPosition,
  isLayoutPinned,
  mergeSubtreeExtent,
} from "@/domain/nodes/nodeLayoutPlacementShared";
import { createTestNode } from "@/testing/createTestNode";

describe("nodeLayoutPlacementShared", () => {
  it("isLayoutPinned は layoutPinned === true のみ", () => {
    expect(isLayoutPinned(createTestNode({ id: 1, label: "a" }))).toBe(false);
    expect(isLayoutPinned(createTestNode({
      id: 2, label: "b", layoutPinned: true,
    }))).toBe(true);
  });

  it("calculateCenteringOffset は余り半分、桁落ちなら null", () => {
    expect(calculateCenteringOffset(100, 40)).toBe(30);
    expect(calculateCenteringOffset(2 ** 60, 60)).toBeNull();
  });

  it("calculateChildFrames は中央寄せして兄弟 gap を挟む", () => {
    const children = [
      createTestNode({ id: 2, parentId: 1, label: "2", height: 20 }),
      createTestNode({ id: 3, parentId: 1, label: "3", height: 20 }),
    ];
    const frames = calculateChildFrames(
      children,
      100,
      80,
      60,
      new Map([[2, 20], [3, 20]]),
      20,
    );
    expect(frames).toEqual([
      { node: children[0], top: 110 },
      { node: children[1], top: 150 },
    ]);
  });

  it("mergeSubtreeExtent / extentFromPosition", () => {
    const node = createTestNode({ id: 1, label: "a", height: 40 });
    expect(extentFromPosition(node, { x: 0, y: 10 })).toEqual({ top: 10, bottom: 50 });
    expect(mergeSubtreeExtent(null, { top: 10, bottom: 50 })).toEqual({ top: 10, bottom: 50 });
    expect(mergeSubtreeExtent(
      { top: 10, bottom: 50 },
      { top: 0, bottom: 80 },
    )).toEqual({ top: 0, bottom: 80 });
  });
});
