import { act, renderHook } from "@testing-library/react";
import { useMapSvgExport } from "@/hooks/useMapSvgExport";
import type { Node } from "@/types/node";

const nodes: readonly Node[] = Object.freeze([
  Object.freeze({
    id: 1, parentId: null, x: 10, y: 20,
    width: 120, height: 48, label: "中心ノード",
  }),
]);
const svgExport = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
  width: 184,
  height: 112,
};

describe("useMapSvgExport", () => {
  it("空マップではダウンロードせず警告を発行する", () => {
    const publishNotice = jest.fn();
    const downloadSvg = jest.fn();
    const { result } = renderHook(() => useMapSvgExport({
      nodes: [], publishNotice, downloadSvg,
    }));

    act(() => result.current());

    expect(publishNotice).toHaveBeenCalledWith({
      kind: "warning", message: "書き出すノードがありません。",
    });
    expect(downloadSvg).not.toHaveBeenCalled();
  });

  it("入力を変更せずSVG Blobを.svg名でダウンロードし成功を発行する", async () => {
    const publishNotice = jest.fn();
    const createSvgExport = jest.fn(() => svgExport);
    const downloadSvg = jest.fn();
    const { result } = renderHook(() => useMapSvgExport({
      nodes, publishNotice, createSvgExport, downloadSvg,
    }));

    act(() => result.current());

    expect(createSvgExport).toHaveBeenCalledWith(nodes);
    expect(downloadSvg).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloadSvg.mock.calls[0] as [Blob, string];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    expect(fileName).toMatch(/^draw-my-map-\d{8}-\d{6}\.svg$/);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toBe('<svg xmlns="http://www.w3.org/2000/svg" />');
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "status", message: "SVGファイルを書き出しました。",
    });
    expect(nodes).toEqual([{
      id: 1, parentId: null, x: 10, y: 20,
      width: 120, height: 48, label: "中心ノード",
    }]);
  });

  it.each(["create", "download"])("%sの同期例外をSVGエラー通知へ変換する", (failure) => {
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapSvgExport({
      nodes,
      publishNotice,
      createSvgExport: () => {
        if (failure === "create") throw new Error("create failed");
        return svgExport;
      },
      downloadSvg: () => { throw new Error("download failed"); },
    }));

    act(() => result.current());

    expect(publishNotice).toHaveBeenCalledWith({
      kind: "error", message: "SVGファイルを書き出せませんでした。",
    });
  });
});
