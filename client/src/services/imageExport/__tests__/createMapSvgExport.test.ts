import { createMapSvgExport } from "@/services/imageExport/createMapSvgExport";
import { createTestNode } from "@/testing/createTestNode";

describe("createMapSvgExport", () => {
  afterEach(() => jest.restoreAllMocks());

  it("空ノードでは文字測定を作成せずnullを返す", () => {
    const createElement = jest.spyOn(document, "createElement");

    expect(createMapSvgExport([])).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });

  it("ノード範囲と一度作成したブラウザ文字測定からSVGを生成する", () => {
    const context = {
      font: "",
      measureText: () => ({ width: 42 }) as TextMetrics,
    } as unknown as CanvasRenderingContext2D;
    const createElement = jest.spyOn(document, "createElement").mockImplementation(() => (
      { getContext: () => context } as unknown as HTMLCanvasElement
    ));

    const result = createMapSvgExport([createTestNode({
      id: 1, parentId: null, x: 10, y: 20,
      width: 120, height: 48, label: "中心ノード",
    })]);

    expect(result).toMatchObject({ width: 184, height: 112 });
    expect(result?.svg).toContain('width="184" height="112" viewBox="0 0 184 112"');
    expect(result?.svg).toContain('x="32" y="32" width="120" height="48"');
    expect(context.font).toBe("14px Arial, Helvetica, sans-serif");
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(createElement).toHaveBeenCalledWith("canvas");
  });

  it("ノードの高さを超える複数行ラベルを切り取らない範囲で生成する", () => {
    const context = {
      font: "",
      measureText: (text: string) => ({ width: Array.from(text).length * 10 }) as TextMetrics,
    } as unknown as CanvasRenderingContext2D;
    jest.spyOn(document, "createElement").mockImplementation(() => (
      { getContext: () => context } as unknown as HTMLCanvasElement
    ));
    const label = Array.from({ length: 10 }, (_, index) => `Line ${index + 1}`).join("\n");

    const result = createMapSvgExport([createTestNode({ height: 64, label })]);

    expect(result).toMatchObject({ width: 164, height: 244 });
    expect(result?.svg).toContain('width="164" height="244" viewBox="0 0 164 244"');
    expect(result?.svg).toContain('x="32" y="90" width="100" height="64"');
    const baselines = Array.from(result?.svg.matchAll(/<tspan x="82" y="([^"]+)"/g) ?? [])
      .map((match) => Number(match[1]));
    expect(baselines).toHaveLength(10);
    expect(Math.min(...baselines)).toBeGreaterThan(0);
    expect(Math.max(...baselines)).toBeLessThan(244);
  });
});
