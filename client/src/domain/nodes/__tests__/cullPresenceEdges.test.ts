import {
  cullPresenceEdgeChildIds,
  segmentIntersectsPaddedAabb,
} from "@/domain/nodes/cullPresenceEdges";
import type { WorldRect } from "@/domain/nodes/cullNodesInViewport";
import { createTestNode } from "@/testing/createTestNode";

const viewportRect: WorldRect = { x: 0, y: 0, width: 200, height: 200 };

describe("segmentIntersectsPaddedAabb", () => {
  it("一端のみ画面内でも交差する", () => {
    expect(segmentIntersectsPaddedAabb(-50, 100, 50, 100, viewportRect, 0)).toBe(true);
    expect(segmentIntersectsPaddedAabb(100, 100, 500, 100, viewportRect, 0)).toBe(true);
  });

  it("両端が完全に画面外で線分も交差しないときは false", () => {
    expect(segmentIntersectsPaddedAabb(-100, -100, -50, -50, viewportRect, 0)).toBe(false);
    expect(segmentIntersectsPaddedAabb(300, 300, 400, 400, viewportRect, 0)).toBe(false);
  });

  it("両端は外でも線分が矩形を横切れば true", () => {
    expect(segmentIntersectsPaddedAabb(-50, 100, 250, 100, viewportRect, 0)).toBe(true);
  });

  it("padding 分だけ判定矩形を広げる", () => {
    expect(segmentIntersectsPaddedAabb(210, 100, 250, 100, viewportRect, 0)).toBe(false);
    expect(segmentIntersectsPaddedAabb(210, 100, 250, 100, viewportRect, 20)).toBe(true);
  });
});

describe("cullPresenceEdgeChildIds", () => {
  it("線分×AABB（パッド込み）で残す／落とす", () => {
    const parent = createTestNode({ id: 1, parentId: null, x: 50, y: 50, width: 40, height: 40 });
    const insideChild = createTestNode({ id: 2, parentId: 1, x: 100, y: 50, width: 40, height: 40 });
    // 親は画面内・子は遠く → 一端のみ内で残る
    const farChild = createTestNode({ id: 3, parentId: 1, x: 5000, y: 50, width: 40, height: 40 });
    // 親子とも画面外
    const farParent = createTestNode({ id: 10, parentId: null, x: 5000, y: 5000, width: 40, height: 40 });
    const farChild2 = createTestNode({ id: 11, parentId: 10, x: 5100, y: 5000, width: 40, height: 40 });

    const nodesById = new Map(
      [parent, insideChild, farChild, farParent, farChild2].map((n) => [n.id, n]),
    );

    expect(
      cullPresenceEdgeChildIds([2, 3, 11], nodesById, viewportRect, 0),
    ).toEqual([2, 3]);
  });
});
