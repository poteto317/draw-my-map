import { NARROW_VIEWPORT_MAX_PX, narrowViewportMediaQuery } from "@/domain/view/narrowViewport";

describe("narrowViewport", () => {
  it("NARROW_VIEWPORT_MAX_PX は 767（768px 未満）", () => {
    expect(NARROW_VIEWPORT_MAX_PX).toBe(767);
  });

  it("matchMedia 用クエリを定数から組み立てる", () => {
    expect(narrowViewportMediaQuery()).toBe("(max-width: 767px)");
  });
});