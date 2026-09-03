import {
  INITIAL_VIEWPORT,
  isValidViewport,
  panViewport,
  screenToWorld,
  worldToScreen,
} from "@/components/map/mapViewport";

describe("map viewport", () => {
  it("初期viewportではワールド座標と画面座標が一致する", () => {
    expect(worldToScreen({ x: 25, y: 40 }, INITIAL_VIEWPORT)).toEqual({ x: 25, y: 40 });
    expect(screenToWorld({ x: 25, y: 40 }, INITIAL_VIEWPORT)).toEqual({ x: 25, y: 40 });
  });

  it("offsetと倍率を含む座標を相互変換する", () => {
    const viewport = { offsetX: 40, offsetY: -20, scale: 2 };
    const world = { x: 30, y: 25 };

    const screen = worldToScreen(world, viewport);

    expect(screen).toEqual({ x: 100, y: 30 });
    expect(screenToWorld(screen, viewport)).toEqual(world);
  });

  it("入力を変更せず画面差分だけoffsetを移動する", () => {
    const viewport = { offsetX: 10, offsetY: 20, scale: 2 };

    expect(panViewport(viewport, 15, -5)).toEqual({ offsetX: 25, offsetY: 15, scale: 2 });
    expect(viewport).toEqual({ offsetX: 10, offsetY: 20, scale: 2 });
  });

  it.each([
    [{ offsetX: Number.NaN, offsetY: 0, scale: 1 }],
    [{ offsetX: 0, offsetY: Number.POSITIVE_INFINITY, scale: 1 }],
    [{ offsetX: 0, offsetY: 0, scale: 0 }],
  ])("無効なviewportを拒否する", (viewport) => {
    expect(isValidViewport(viewport)).toBe(false);
  });

  it("無効なパン差分では元のviewportを返す", () => {
    expect(panViewport(INITIAL_VIEWPORT, Number.NaN, 1)).toBe(INITIAL_VIEWPORT);
  });
});
