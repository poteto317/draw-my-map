import { toPointerSample } from "@/components/map/pixi/pointerSample";

describe("toPointerSample", () => {
  it("画面座標を維持して現在viewportのワールド座標へ変換する", () => {
    expect(toPointerSample({
      globalX: 120,
      globalY: 90,
      pointerId: 7,
      pointerType: "pen",
    }, { offsetX: 20, offsetY: 10, scale: 2 })).toEqual({
      pointerId: 7,
      pointerType: "pen",
      screen: { x: 120, y: 90 },
      world: { x: 50, y: 40 },
    });
  });

  it("空のpointerTypeをmouseへ正規化する", () => {
    expect(toPointerSample({
      globalX: 0,
      globalY: 0,
      pointerId: 1,
      pointerType: "",
    }, { offsetX: 0, offsetY: 0, scale: 1 }).pointerType).toBe("mouse");
  });
});
