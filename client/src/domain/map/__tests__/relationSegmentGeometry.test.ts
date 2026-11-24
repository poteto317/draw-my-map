import {
  exitPointOnNodeOutline,
  relationSegmentOutsideNodes,
} from "@/domain/map/relationSegmentGeometry";
import { createTestNode } from "@/testing/createTestNode";

describe("exitPointOnNodeOutline", () => {
  const node = createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 });

  it("水平方向では左右辺に出る", () => {
    expect(exitPointOnNodeOutline(node, { x: 200, y: 30 })).toEqual({ x: 100, y: 30 });
    expect(exitPointOnNodeOutline(node, { x: -50, y: 30 })).toEqual({ x: 0, y: 30 });
  });

  it("垂直方向では上下辺に出る", () => {
    expect(exitPointOnNodeOutline(node, { x: 50, y: 200 })).toEqual({ x: 50, y: 60 });
    expect(exitPointOnNodeOutline(node, { x: 50, y: -20 })).toEqual({ x: 50, y: 0 });
  });
});

describe("relationSegmentOutsideNodes", () => {
  it("水平に並ぶノードでは辺から辺へ短縮する（中心同士ではない）", () => {
    const from = createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 });
    const to = createTestNode({ id: 2, x: 200, y: 0, width: 100, height: 60 });
    expect(relationSegmentOutsideNodes(from, to)).toEqual({
      start: { x: 100, y: 30 },
      end: { x: 200, y: 30 },
    });
  });

  it("端点がノード矩形の外（または境界）にあり、中心にはない", () => {
    const from = createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 });
    const to = createTestNode({ id: 2, x: 150, y: 100, width: 100, height: 60 });
    const segment = relationSegmentOutsideNodes(from, to);
    expect(segment).not.toBeNull();
    // 中心は (50,30) / (200,130)
    expect(segment!.start).not.toEqual({ x: 50, y: 30 });
    expect(segment!.end).not.toEqual({ x: 200, y: 130 });
    // start は from の境界上
    const onFromBorder =
      segment!.start.x === 0
      || segment!.start.x === 100
      || segment!.start.y === 0
      || segment!.start.y === 60;
    expect(onFromBorder).toBe(true);
  });
});
