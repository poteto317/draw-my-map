import { focusViewportOnNode, focusViewportOnWorldPoint } from "@/components/map/nodeViewportFocus";
import type { Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import { INITIAL_VIEWPORT } from "@/types/viewport";

const viewport: Viewport = { offsetX: 10, offsetY: 20, scale: 2 };
const node: Node = createTestNode({
  id: 1,
  parentId: null,
  x: 50,
  y: 30,
  width: 100,
  height: 60,
  label: "node",
});

describe("focusViewportOnWorldPoint", () => {
  it("指定ワールド点を画面中央へパンする（倍率は維持）", () => {
    const next = focusViewportOnWorldPoint(
      INITIAL_VIEWPORT,
      { x: 100, y: 50 },
      { width: 400, height: 300 },
    );
    expect(next.scale).toBe(1);
    expect(next.offsetX).toBe(100);
    expect(next.offsetY).toBe(100);
  });

  it("無効な入力では元の viewport を返す", () => {
    expect(focusViewportOnWorldPoint(
      INITIAL_VIEWPORT,
      { x: Number.NaN, y: 0 },
      { width: 100, height: 100 },
    )).toBe(INITIAL_VIEWPORT);
  });
});

describe("focusViewportOnNode", () => {
  it("現在倍率を保ってノード中心を画面中央へ移す", () => {
    expect(focusViewportOnNode(viewport, node, { width: 800, height: 600 })).toEqual({
      offsetX: 200,
      offsetY: 180,
      scale: 2,
    });
  });

  it.each([
    [{ ...node, x: Number.NaN }, { width: 800, height: 600 }],
    [node, { width: Number.POSITIVE_INFINITY, height: 600 }],
  ])("非有限のノードまたは画面では元のviewportを返す", (invalidNode, screen) => {
    expect(focusViewportOnNode(viewport, invalidNode, screen)).toBe(viewport);
  });

  it("ノードが既に中央なら同じviewportを返す", () => {
    const centered = { offsetX: 200, offsetY: 180, scale: 2 };

    expect(focusViewportOnNode(centered, node, { width: 800, height: 600 }))
      .toBe(centered);
  });

  it("有限値同士の演算結果が非有限になる場合は元のviewportを返す", () => {
    expect(focusViewportOnNode(
      viewport,
      { ...node, x: 1e308, width: 0 },
      { width: 800, height: 600 },
    )).toBe(viewport);
  });
});
