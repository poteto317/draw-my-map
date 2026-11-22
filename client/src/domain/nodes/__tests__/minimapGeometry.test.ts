import {
  computeNodesWorldBounds,
  createMinimapTransform,
  MINIMAP_DEFAULT_HEIGHT,
  MINIMAP_DEFAULT_WIDTH,
  MINIMAP_MAX_DRAW_NODES,
  MINIMAP_PADDING,
  minimapToWorld,
  thinMinimapNodes,
  worldRectToMinimapRect,
  worldToMinimap,
} from "@/domain/nodes/minimapGeometry";
import { createTestNode } from "@/testing/createTestNode";

describe("computeNodesWorldBounds", () => {
  it("ノードが無いときは null", () => {
    expect(computeNodesWorldBounds([])).toBeNull();
  });

  it("全ノードの AABB を返す", () => {
    const a = createTestNode({ id: 1, x: 10, y: 20, width: 40, height: 30 });
    const b = createTestNode({ id: 2, x: 100, y: 50, width: 20, height: 10 });
    expect(computeNodesWorldBounds([a, b])).toEqual({
      x: 10,
      y: 20,
      width: 110,
      height: 40,
    });
  });

  it("幅または高さが 0 のときは最小 1 に広げる", () => {
    const node = createTestNode({ id: 1, x: 5, y: 5, width: 0, height: 0 });
    expect(computeNodesWorldBounds([node])).toEqual({
      x: 5,
      y: 5,
      width: 1,
      height: 1,
    });
  });
});

describe("createMinimapTransform / world↔minimap", () => {
  it("ワールド座標をミニマップ座標へ往復できる", () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const transform = createMinimapTransform(
      bounds,
      { width: MINIMAP_DEFAULT_WIDTH, height: MINIMAP_DEFAULT_HEIGHT },
      MINIMAP_PADDING,
    );
    const world = { x: 100, y: 50 };
    const mini = worldToMinimap(world, transform);
    const back = minimapToWorld(mini, transform);
    expect(back.x).toBeCloseTo(world.x);
    expect(back.y).toBeCloseTo(world.y);
  });

  it("アスペクト比を保ちパディング内に収める", () => {
    const bounds = { x: 0, y: 0, width: 400, height: 100 };
    const size = { width: 160, height: 120 };
    const transform = createMinimapTransform(bounds, size, 8);
    const topLeft = worldToMinimap({ x: 0, y: 0 }, transform);
    const bottomRight = worldToMinimap({ x: 400, y: 100 }, transform);
    expect(topLeft.x).toBeGreaterThanOrEqual(8);
    expect(topLeft.y).toBeGreaterThanOrEqual(8);
    expect(bottomRight.x).toBeLessThanOrEqual(160 - 8);
    expect(bottomRight.y).toBeLessThanOrEqual(120 - 8);
    const drawnW = bottomRight.x - topLeft.x;
    const drawnH = bottomRight.y - topLeft.y;
    expect(drawnW / drawnH).toBeCloseTo(4, 5);
  });
});

describe("worldRectToMinimapRect", () => {
  it("ビューポートワールド矩形をミニマップ矩形へ写す", () => {
    const transform = createMinimapTransform(
      { x: 0, y: 0, width: 200, height: 200 },
      { width: 100, height: 100 },
      0,
    );
    const rect = worldRectToMinimapRect(
      { x: 50, y: 50, width: 100, height: 50 },
      transform,
    );
    expect(rect.x).toBeCloseTo(25);
    expect(rect.y).toBeCloseTo(25);
    expect(rect.width).toBeCloseTo(50);
    expect(rect.height).toBeCloseTo(25);
  });
});

describe("thinMinimapNodes", () => {
  it("上限以下ならそのまま返す", () => {
    const nodes = [1, 2, 3];
    expect(thinMinimapNodes(nodes, 5)).toEqual([1, 2, 3]);
  });

  it("上限超過時は順序を保ちつつ間引く", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => i);
    const thinned = thinMinimapNodes(nodes, 4);
    expect(thinned).toHaveLength(4);
    expect(thinned).toEqual([...thinned].sort((a, b) => a - b));
    expect(thinned[0]).toBe(0);
  });

  it("既定上限定数がある", () => {
    expect(MINIMAP_MAX_DRAW_NODES).toBeGreaterThan(0);
  });
});
