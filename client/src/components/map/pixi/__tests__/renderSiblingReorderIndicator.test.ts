import { renderSiblingReorderIndicator } from "@/components/map/pixi/renderSiblingReorderIndicator";
import { createPixiTestHarness } from "../testing/pixiTestHarness";

function renderIndicator(indicator: Parameters<typeof renderSiblingReorderIndicator>[2]) {
  const harness = createPixiTestHarness();
  const worldContainer = { addChild: jest.fn() };
  renderSiblingReorderIndicator(worldContainer as never, harness.constructors as never, indicator);
  return { ...harness, worldContainer };
}

describe("renderSiblingReorderIndicator", () => {
  it("挿入位置に高さ6の青い横線を描き、ポインタのイベントを受けない", () => {
    const { Graphics, worldContainer } = renderIndicator({ left: 212, right: 328, y: 280 });
    const line = Graphics.mock.results[0].value;

    expect(Graphics).toHaveBeenCalledTimes(1);
    expect(line.rect).toHaveBeenCalledWith(212, 277, 116, 6);
    expect(line.fill).toHaveBeenCalledWith({ color: 0x2563eb });
    expect(line.eventMode).toBe("none");
    expect(worldContainer.addChild).toHaveBeenCalledTimes(1);
    expect(worldContainer.addChild).toHaveBeenCalledWith(line);
  });

  it("indicatorがnullなら線を作らない", () => {
    const { Graphics, worldContainer } = renderIndicator(null);

    expect(Graphics).not.toHaveBeenCalled();
    expect(worldContainer.addChild).not.toHaveBeenCalled();
  });

  it.each([
    ["left", { left: Infinity, right: 328, y: 280 }],
    ["right", { left: 212, right: -Infinity, y: 280 }],
    ["y", { left: 212, right: 328, y: NaN }],
    ["幅(right - left)", { left: -1e308, right: 1e308, y: 280 }],
  ])("%sが有限でないなら線を作らない", (_name, indicator) => {
    const { Graphics, worldContainer } = renderIndicator(indicator);

    expect(Graphics).not.toHaveBeenCalled();
    expect(worldContainer.addChild).not.toHaveBeenCalled();
  });

  it("中点の計算が1e308級の座標で溢れたyでも線を作らない", () => {
    const { Graphics, worldContainer } = renderIndicator({
      left: 212, right: 328, y: (1e308 + 1e308) / 2,
    });

    expect(Graphics).not.toHaveBeenCalled();
    expect(worldContainer.addChild).not.toHaveBeenCalled();
  });
});
