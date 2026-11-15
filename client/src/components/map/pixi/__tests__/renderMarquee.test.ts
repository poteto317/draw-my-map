import { renderMarquee } from "@/components/map/pixi/renderMarquee";
import { createPixiTestHarness } from "../testing/pixiTestHarness";

function render(rect: Parameters<typeof renderMarquee>[2]) {
  const harness = createPixiTestHarness();
  const worldContainer = { addChild: jest.fn() };
  renderMarquee(worldContainer as never, harness.constructors as never, rect);
  return { ...harness, worldContainer };
}

describe("renderMarquee", () => {
  it("marqueeRect があるとき選択色系のラバーバンドを描き、ポインタを受けない", () => {
    const { Graphics, worldContainer } = render({ x: 10, y: 20, width: 100, height: 40 });
    const band = Graphics.mock.results[0].value;

    expect(Graphics).toHaveBeenCalledTimes(1);
    expect(band.rect).toHaveBeenCalledWith(10, 20, 100, 40);
    expect(band.fill).toHaveBeenCalledWith({ color: 0x2563eb, alpha: 0.15 });
    expect(band.stroke).toHaveBeenCalledWith({ width: 1, color: 0x2563eb, alpha: 0.9 });
    expect(band.eventMode).toBe("none");
    expect(worldContainer.addChild).toHaveBeenCalledWith(band);
  });

  it("marqueeRect が null のとき描画しない", () => {
    const { Graphics, worldContainer } = render(null);

    expect(Graphics).not.toHaveBeenCalled();
    expect(worldContainer.addChild).not.toHaveBeenCalled();
  });

  it.each([
    ["x", { x: NaN, y: 20, width: 100, height: 40 }],
    ["y", { x: 10, y: Infinity, width: 100, height: 40 }],
    ["width", { x: 10, y: 20, width: -Infinity, height: 40 }],
    ["height", { x: 10, y: 20, width: 100, height: NaN }],
  ])("%s が有限でないなら描画しない", (_name, rect) => {
    const { Graphics, worldContainer } = render(rect);

    expect(Graphics).not.toHaveBeenCalled();
    expect(worldContainer.addChild).not.toHaveBeenCalled();
  });
});
