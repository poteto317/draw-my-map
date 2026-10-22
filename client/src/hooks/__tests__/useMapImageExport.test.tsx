import { act, renderHook } from "@testing-library/react";
import { useMapImageExport } from "@/hooks/useMapImageExport";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({
  id: 1, parentId: null, x: 10, y: 20,
  width: 120, height: 48, label: "中心ノード",
})];
const svgExport = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
  width: 184,
  height: 112,
};

describe("useMapImageExport", () => {
  it("公開戻り値の形と初期状態を維持する", () => {
    const { result } = renderHook(() => useMapImageExport({ nodes, mapName: "旅行" }));

    expect(result.current).toEqual({
      exportSvg: expect.any(Function),
      exportPng: expect.any(Function),
      isExportingPng: false,
      notice: null,
    });
  });

  it("各形式の依存を配線しSVGとPNGの通知が同じslotを上書きする", async () => {
    const createSvgExport = jest.fn(() => svgExport);
    const downloadSvg = jest.fn();
    const pngBlob = new Blob(["png"], { type: "image/png" });
    const rasterizePng = jest.fn(async () => pngBlob);
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapImageExport({
      nodes, mapName: "旅行", createSvgExport, downloadSvg, rasterizePng, downloadPng,
    }));

    act(() => result.current.exportSvg());

    expect(createSvgExport).toHaveBeenNthCalledWith(1, nodes);
    expect(downloadSvg).toHaveBeenCalledTimes(1);
    expect(downloadPng).not.toHaveBeenCalled();
    expect(rasterizePng).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({
      kind: "status", message: "SVGファイルを書き出しました。",
    });

    await act(async () => result.current.exportPng());

    expect(createSvgExport).toHaveBeenNthCalledWith(2, nodes);
    expect(rasterizePng).toHaveBeenCalledWith(
      '<svg xmlns="http://www.w3.org/2000/svg" />', 184, 112,
    );
    expect(downloadSvg).toHaveBeenCalledWith(
      expect.any(Blob), expect.stringMatching(/^旅行-\d{8}-\d{6}\.svg$/),
    );
    expect(downloadPng).toHaveBeenCalledWith(
      pngBlob, expect.stringMatching(/^旅行-\d{8}-\d{6}\.png$/),
    );
    expect(downloadSvg).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toEqual({
      kind: "status", message: "PNGファイルを書き出しました。",
    });

    act(() => result.current.exportSvg());

    expect(result.current.notice).toEqual({
      kind: "status", message: "SVGファイルを書き出しました。",
    });
  });

  it("PNG処理中の状態を公開しSVG操作後もPNG完了通知を共有する", async () => {
    let resolve!: (blob: Blob) => void;
    const pending = new Promise<Blob>((resolvePromise) => { resolve = resolvePromise; });
    const { result } = renderHook(() => useMapImageExport({
      nodes,
      mapName: "旅行",
      createSvgExport: () => svgExport,
      downloadSvg: () => {},
      rasterizePng: () => pending,
      downloadPng: () => {},
    }));
    let exporting!: Promise<void>;

    act(() => { exporting = result.current.exportPng(); });

    expect(result.current.isExportingPng).toBe(true);

    act(() => result.current.exportSvg());

    expect(result.current.notice).toEqual({
      kind: "status", message: "SVGファイルを書き出しました。",
    });
    expect(result.current.isExportingPng).toBe(true);

    await act(async () => {
      resolve(new Blob(["png"]));
      await exporting;
    });

    expect(result.current.notice).toEqual({
      kind: "status", message: "PNGファイルを書き出しました。",
    });
    expect(result.current.isExportingPng).toBe(false);
  });
});
