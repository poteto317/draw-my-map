import { createMapTextMeasurer } from "@/services/imageExport/mapTextMeasurement";

describe("mapTextMeasurement", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SVGと同じフォントでテキスト幅を測定する", () => {
    const measureText = jest.fn(() => ({ width: 37 }) as TextMetrics);
    const context = { font: "", measureText } as unknown as CanvasRenderingContext2D;
    jest.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return { getContext: () => context } as unknown as HTMLCanvasElement;
      }
      throw new Error(`Unexpected element: ${tagName}`);
    }) as typeof document.createElement);

    const measure = createMapTextMeasurer();

    expect(measure("地図ラベル")).toBe(37);
    expect(context.font).toBe("14px Arial, Helvetica, sans-serif");
    expect(measureText).toHaveBeenCalledWith("地図ラベル");
  });

  it("2Dコンテキストを取得できない場合は測定器を作らない", () => {
    jest.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return { getContext: () => null } as unknown as HTMLCanvasElement;
      }
      throw new Error(`Unexpected element: ${tagName}`);
    }) as typeof document.createElement);

    expect(() => createMapTextMeasurer()).toThrow("Canvas 2D context is unavailable");
  });
});
