import { act, renderHook } from "@testing-library/react";
import { useMapImageExport } from "@/hooks/useMapImageExport";
import type { MapSvgDocument } from "@/domain/imageExport/mapSvgDocument";
import type { Node } from "@/types/node";

const nodes: readonly Node[] = [
  Object.freeze({
    id: 1,
    parentId: null,
    x: 10,
    y: 20,
    width: 120,
    height: 48,
    label: "中心ノード",
  }),
];

const svgExport: MapSvgDocument = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
  width: 184,
  height: 112,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useMapImageExport", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("空のマップでは画像処理を始めず警告する", async () => {
    const createSvgExport = jest.fn(() => null);
    const downloadSvg = jest.fn();
    const rasterizePng = jest.fn();
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapImageExport({
      nodes: [],
      createSvgExport,
      downloadSvg,
      rasterizePng,
      downloadPng,
    }));

    act(() => result.current.exportSvg());

    expect(result.current.notice).toEqual({
      kind: "warning",
      message: "書き出すノードがありません。",
    });
    expect(downloadSvg).not.toHaveBeenCalled();

    await act(async () => result.current.exportPng());

    expect(result.current.notice).toEqual({
      kind: "warning",
      message: "書き出すノードがありません。",
    });
    expect(createSvgExport).toHaveBeenCalledTimes(2);
    expect(rasterizePng).not.toHaveBeenCalled();
    expect(downloadPng).not.toHaveBeenCalled();
    expect(result.current.isExportingPng).toBe(false);
  });

  it("SVG Blobを.svgファイルとして書き出して成功を通知する", () => {
    const createSvgExport = jest.fn(() => svgExport);
    const downloadSvg = jest.fn();
    const { result } = renderHook(() => useMapImageExport({
      nodes,
      createSvgExport,
      downloadSvg,
    }));

    act(() => result.current.exportSvg());

    expect(createSvgExport).toHaveBeenCalledWith(nodes);
    expect(downloadSvg).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloadSvg.mock.calls[0] as [Blob, string];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    expect(fileName).toMatch(/^draw-my-map-\d{8}-\d{6}\.svg$/);
    expect(result.current.notice).toEqual({
      kind: "status",
      message: "SVGファイルを書き出しました。",
    });
    expect(nodes).toEqual([
      {
        id: 1,
        parentId: null,
        x: 10,
        y: 20,
        width: 120,
        height: 48,
        label: "中心ノード",
      },
    ]);
  });

  it("既定のSVG生成経路でノード範囲とブラウザ文字測定を反映する", async () => {
    const context = {
      font: "",
      measureText: () => ({ width: 42 }) as TextMetrics,
    } as unknown as CanvasRenderingContext2D;
    const downloadSvg = jest.fn();
    const { result } = renderHook(() => useMapImageExport({
      nodes,
      downloadSvg,
    }));
    jest.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return { getContext: () => context } as unknown as HTMLCanvasElement;
      }
      throw new Error(`Unexpected element: ${tagName}`);
    }) as typeof document.createElement);

    act(() => result.current.exportSvg());

    expect(downloadSvg).toHaveBeenCalledTimes(1);
    const [blob] = downloadSvg.mock.calls[0] as [Blob, string];
    const svg = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(svg).toContain('width="184" height="112" viewBox="0 0 184 112"');
    expect(svg).toContain('x="32" y="32" width="120" height="48"');
    expect(context.font).toBe("14px Arial, Helvetica, sans-serif");
  });

  it("SVG書き出し例外をエラー通知へ変換する", () => {
    const { result } = renderHook(() => useMapImageExport({
      nodes,
      createSvgExport: () => svgExport,
      downloadSvg: () => {
        throw new Error("download failed");
      },
    }));

    act(() => result.current.exportSvg());

    expect(result.current.notice).toEqual({
      kind: "error",
      message: "SVGファイルを書き出せませんでした。",
    });
  });

  it("共有SVGをPNGへ変換して.pngファイルとして書き出す", async () => {
    const pngBlob = new Blob(["png"], { type: "image/png" });
    const rasterizePng = jest.fn(async () => pngBlob);
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapImageExport({
      nodes,
      createSvgExport: () => svgExport,
      rasterizePng,
      downloadPng,
    }));

    await act(async () => result.current.exportPng());

    expect(rasterizePng).toHaveBeenCalledWith(
      svgExport.svg,
      svgExport.width,
      svgExport.height,
    );
    expect(downloadPng).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloadPng.mock.calls[0] as [Blob, string];
    expect(blob).toBe(pngBlob);
    expect(fileName).toMatch(/^draw-my-map-\d{8}-\d{6}\.png$/);
    expect(result.current.notice).toEqual({
      kind: "status",
      message: "PNGファイルを書き出しました。",
    });
    expect(result.current.isExportingPng).toBe(false);
  });

  it("PNG変換例外をエラー通知へ変換して処理中状態を解除する", async () => {
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapImageExport({
      nodes,
      createSvgExport: () => svgExport,
      rasterizePng: async () => {
        throw new Error("rasterize failed");
      },
      downloadPng,
    }));

    await act(async () => result.current.exportPng());

    expect(downloadPng).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({
      kind: "error",
      message: "PNGファイルを書き出せませんでした。",
    });
    expect(result.current.isExportingPng).toBe(false);
  });

  it("同一tickのPNG連打を同期ガードして最初の処理だけを完了する", async () => {
    const pendingRasterization = deferred<Blob>();
    const rasterizePng = jest.fn(() => pendingRasterization.promise);
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapImageExport({
      nodes,
      createSvgExport: () => svgExport,
      rasterizePng,
      downloadPng,
    }));
    let firstExport!: Promise<void>;
    let secondExport!: Promise<void>;

    act(() => {
      firstExport = result.current.exportPng();
      secondExport = result.current.exportPng();
    });

    expect(rasterizePng).toHaveBeenCalledTimes(1);
    expect(result.current.isExportingPng).toBe(true);

    const pngBlob = new Blob(["png"], { type: "image/png" });
    await act(async () => {
      pendingRasterization.resolve(pngBlob);
      await Promise.all([firstExport, secondExport]);
    });

    expect(downloadPng).toHaveBeenCalledTimes(1);
    expect(downloadPng).toHaveBeenCalledWith(
      pngBlob,
      expect.stringMatching(/^draw-my-map-\d{8}-\d{6}\.png$/),
    );
    expect(result.current.isExportingPng).toBe(false);
  });
});
