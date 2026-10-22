import {
  MENU_ACTIVATION_DOUBLE_CLICK_WINDOW_MS,
  isDoubleClickFromOverlayActivation,
} from "@/components/map/menuActivationDoubleClick";

describe("isDoubleClickFromOverlayActivation", () => {
  it("メニュー操作が未記録ならfalse", () => {
    expect(isDoubleClickFromOverlayActivation(null, 1000)).toBe(false);
  });

  it("ウィンドウ内ならtrue", () => {
    expect(isDoubleClickFromOverlayActivation(1000, 1000)).toBe(true);
    expect(isDoubleClickFromOverlayActivation(1000, 1100)).toBe(true);
  });

  it("ちょうどウィンドウ境界ならfalse", () => {
    expect(
      isDoubleClickFromOverlayActivation(1000, 1000 + MENU_ACTIVATION_DOUBLE_CLICK_WINDOW_MS),
    ).toBe(false);
  });

  it("ウィンドウ経過後はfalse", () => {
    expect(isDoubleClickFromOverlayActivation(1000, 2000)).toBe(false);
  });

  it("nowがactivatedAtより前(時計のずれ)ならfalse", () => {
    expect(isDoubleClickFromOverlayActivation(1000, 999)).toBe(false);
  });
});
