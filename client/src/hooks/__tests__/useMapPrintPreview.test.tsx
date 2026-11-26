import { renderHook } from "@testing-library/react";
import { useMapPrintPreview } from "@/hooks/useMapPrintPreview";
import { createTestNode } from "@/testing/createTestNode";
import { DEFAULT_MAP_PRINT_SETTINGS } from "@/types/mapPrintExport";

const nodes = [createTestNode({ label: "印刷対象", width: 1500, height: 1050 })];
const settings = DEFAULT_MAP_PRINT_SETTINGS;
const tileSettings = { ...settings, pagination: "tile" } as const;

type CanvasForTextMeasurement = {
  getContext(contextId: "2d"): {
    font: string;
    measureText(text: string): Pick<TextMetrics, "width">;
  } | null;
};

describe("useMapPrintPreview", () => {
  let getCanvasContext: jest.SpiedFunction<CanvasForTextMeasurement["getContext"]>;

  beforeEach(() => {
    const canvas: CanvasForTextMeasurement = HTMLCanvasElement.prototype;
    getCanvasContext = jest.spyOn(canvas, "getContext").mockReturnValue({
      font: "",
      measureText: (text: string) => ({ width: text.length * 8 }),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("対象が空なら空の通知を返す", () => {
    const { result } = renderHook(() => useMapPrintPreview({
      nodes: [], settings, unavailableReason: undefined,
    }));

    expect(result.current).toEqual({
      layout: undefined,
      error: "書き出すノードがありません。",
    });
  });

  it("対象の計測に失敗したら準備失敗の通知を返す", () => {
    getCanvasContext.mockReturnValue(null);

    const { result } = renderHook(() => useMapPrintPreview({
      nodes, settings, unavailableReason: undefined,
    }));

    expect(result.current).toEqual({
      layout: undefined,
      error: "印刷の準備ができませんでした。設定を確認して再試行してください。",
    });
  });

  it.each([NaN, 50.1])("無効な余白 %s ではプレビューを返さない", (top) => {
    const { result } = renderHook(() => useMapPrintPreview({
      nodes,
      settings: { ...settings, margins: { ...settings.margins, top } },
      unavailableReason: undefined,
    }));

    expect(result.current).toEqual({ layout: undefined, error: undefined });
  });

  it("対象が空でも印刷不可の理由を優先する", () => {
    const { result } = renderHook(() => useMapPrintPreview({
      nodes: [], settings, unavailableReason: "この書き出し対象では使えません。",
    }));

    expect(result.current).toEqual({
      layout: undefined,
      error: "この書き出し対象では使えません。",
    });
  });

  it("用紙と余白を変えると計測を再利用し、対象ノードが変わると計測し直す", () => {
    const initialProps: Parameters<typeof useMapPrintPreview>[0] = {
      nodes, settings: tileSettings, unavailableReason: undefined,
    };
    const { result, rerender } = renderHook(useMapPrintPreview, { initialProps });

    expect(result.current.layout).toMatchObject({ columns: 3, rows: 2 });
    expect(result.current.layout?.pages).toHaveLength(6);
    expect(getCanvasContext).toHaveBeenCalledTimes(1);

    const a3Settings = { ...tileSettings, paperSize: "a3" } as const;
    rerender({ ...initialProps, settings: a3Settings });
    expect(result.current.layout?.pages).toHaveLength(2);
    expect(getCanvasContext).toHaveBeenCalledTimes(1);

    const widerMargins = {
      ...a3Settings,
      margins: { ...settings.margins, left: 50, right: 50 },
    };
    rerender({ ...initialProps, settings: widerMargins });
    expect(result.current.layout?.pages).toHaveLength(3);
    expect(getCanvasContext).toHaveBeenCalledTimes(1);

    rerender({ ...initialProps, settings: widerMargins, nodes: [createTestNode()] });
    expect(result.current.layout?.pages).toHaveLength(1);
    expect(getCanvasContext).toHaveBeenCalledTimes(2);
  });
});
