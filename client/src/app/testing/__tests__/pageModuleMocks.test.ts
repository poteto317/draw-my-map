import {
  createMapTextMeasurementModuleMock,
  createPagePixiModuleMock,
} from "@/app/testing/pageModuleMocks";
import { mockStage } from "@/components/map/testing/mapStageTestRuntime";

describe("pageModuleMocks", () => {
  it("文字幅の測定は、文字数×8px を返す", () => {
    const measure = createMapTextMeasurementModuleMock().createMapTextMeasurer();

    expect(measure("")).toBe(0);
    expect(measure("abc")).toBe(24);
    expect(measure("あいう")).toBe(24);
  });

  it("Pixi の標準形の Application は、mapStageTestRuntime の共有のステージと 800×600 の画面を持つ", () => {
    const pixi = createPagePixiModuleMock();

    const app = new pixi.Application();

    expect(app.stage).toBe(mockStage);
    expect(app.screen).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});
