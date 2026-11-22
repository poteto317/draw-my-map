import { collectVisibleMapKeys } from "@/components/map/pixi/mapVisibilityKeys";
import {
  cullNodesInViewport,
  mergeCulledNodesWithRequired,
  type WorldRect,
} from "@/domain/nodes/cullNodesInViewport";
import { createTestNode } from "@/testing/createTestNode";

const viewportRect: WorldRect = { x: 0, y: 0, width: 200, height: 200 };

describe("cullNodesInViewport", () => {
  it("ビューポート矩形と交差するノードだけを返す", () => {
    const inside = createTestNode({ id: 1, x: 50, y: 50, width: 40, height: 40 });
    const outside = createTestNode({ id: 2, x: 400, y: 400, width: 40, height: 40 });
    const edgeTouch = createTestNode({ id: 3, x: 200, y: 100, width: 40, height: 40 });

    expect(cullNodesInViewport([inside, outside, edgeTouch], viewportRect, 0).map((n) => n.id))
      .toEqual([1]);
  });

  it("padding 分だけ判定矩形を広げる", () => {
    const nearOutside = createTestNode({ id: 1, x: 210, y: 100, width: 40, height: 40 });

    expect(cullNodesInViewport([nearOutside], viewportRect, 0)).toEqual([]);
    expect(cullNodesInViewport([nearOutside], viewportRect, 20).map((n) => n.id)).toEqual([1]);
  });

  it("部分的に重なるノードは残す", () => {
    const partial = createTestNode({ id: 1, x: -20, y: -20, width: 40, height: 40 });

    expect(cullNodesInViewport([partial], viewportRect, 0).map((n) => n.id)).toEqual([1]);
  });

  it("元の順序を保つ", () => {
    const a = createTestNode({ id: 10, x: 10, y: 10, width: 10, height: 10 });
    const b = createTestNode({ id: 20, x: 50, y: 50, width: 10, height: 10 });
    const c = createTestNode({ id: 30, x: 500, y: 500, width: 10, height: 10 });

    expect(cullNodesInViewport([a, b, c], viewportRect, 0).map((n) => n.id)).toEqual([10, 20]);
  });

  it("空配列なら空を返す", () => {
    expect(cullNodesInViewport([], viewportRect, 0)).toEqual([]);
  });
});

describe("mergeCulledNodesWithRequired", () => {
  it("必須 ID を画面外でも集合へ戻し、nodes の順序を保つ", () => {
    const inside = createTestNode({ id: 1, x: 50, y: 50, width: 40, height: 40 });
    const outside = createTestNode({ id: 2, x: 500, y: 500, width: 40, height: 40 });
    const culled = cullNodesInViewport([inside, outside], viewportRect, 0);

    expect(mergeCulledNodesWithRequired([inside, outside], culled, new Set()).map((n) => n.id))
      .toEqual([1]);
    expect(mergeCulledNodesWithRequired([inside, outside], culled, new Set([2])).map((n) => n.id))
      .toEqual([1, 2]);
  });
});

describe("cullNodesInViewport と辺キー", () => {
  it("両端がカリング後集合に含まれる辺だけが visibleKeys に入る", () => {
    const parent = createTestNode({ id: 1, parentId: null, x: 50, y: 50, width: 40, height: 40 });
    const childInside = createTestNode({ id: 2, parentId: 1, x: 80, y: 80, width: 40, height: 40 });
    const childOutside = createTestNode({ id: 3, parentId: 1, x: 500, y: 500, width: 40, height: 40 });
    const all = [parent, childInside, childOutside];
    const culled = cullNodesInViewport(all, viewportRect, 0);
    const culledIds = new Set(culled.map((n) => n.id));

    expect([...culledIds].sort((a, b) => a - b)).toEqual([1, 2]);

    const keys = collectVisibleMapKeys(culled, culledIds);
    expect(keys.has("node:1")).toBe(true);
    expect(keys.has("node:2")).toBe(true);
    expect(keys.has("edge:2")).toBe(true);
    expect(keys.has("node:3")).toBe(false);
    expect(keys.has("edge:3")).toBe(false);
  });
});
