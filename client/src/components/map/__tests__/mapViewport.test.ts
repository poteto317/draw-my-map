import {
  INITIAL_VIEWPORT,
  MIN_VIEWPORT_SCALE,
  MAX_VIEWPORT_SCALE,
  isValidViewport,
  panViewport,
  screenToWorld,
  worldToScreen,
  zoomViewportAt,
  focusViewportOnNode,
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

describe("zoomViewportAt", () => {
  it.each([
    [0.01, MIN_VIEWPORT_SCALE],
    [10, MAX_VIEWPORT_SCALE],
  ])("requested scale %sを%sへ制限する", (requested, expected) => {
    expect(zoomViewportAt(INITIAL_VIEWPORT, { x: 100, y: 80 }, requested).scale)
      .toBe(expected);
  });

  it("ズーム前後でanchor直下のワールド座標を維持する", () => {
    const viewport = { offsetX: 30, offsetY: -20, scale: 1.5 };
    const anchor = { x: 240, y: 160 };
    const worldBefore = screenToWorld(anchor, viewport);

    const next = zoomViewportAt(viewport, anchor, 3);

    expect(screenToWorld(anchor, next)).toEqual(worldBefore);
  });

  it("非有限の倍率・anchorでは元のviewportを返す", () => {
    expect(zoomViewportAt(INITIAL_VIEWPORT, { x: Number.NaN, y: 0 }, 2))
      .toBe(INITIAL_VIEWPORT);
    expect(zoomViewportAt(INITIAL_VIEWPORT, { x: 0, y: 0 }, Number.NaN))
      .toBe(INITIAL_VIEWPORT);
  });
});

describe("focusViewportOnNode", () => {
  it("現在倍率を保ってノード中心を画面中央へ移す", () => {
    const node = {
      id: 1,
      parentId: null,
      x: 100,
      y: 50,
      width: 80,
      height: 40,
      label: "node",
    };

    expect(focusViewportOnNode(
      { offsetX: 0, offsetY: 0, scale: 2 },
      node,
      { width: 800, height: 600 },
    )).toEqual({ offsetX: 120, offsetY: 160, scale: 2 });
  });

  it("非有限の画面サイズでは元のviewportを返す", () => {
    expect(focusViewportOnNode(
      INITIAL_VIEWPORT,
      { id: 1, parentId: null, x: 0, y: 0, width: 1, height: 1, label: "" },
      { width: Number.POSITIVE_INFINITY, height: 600 },
    )).toBe(INITIAL_VIEWPORT);
  });
});
