import { act, renderHook } from "@testing-library/react";
import { useMapPngExport } from "@/hooks/useMapPngExport";

const nodes = [{
  id: 1, parentId: null, x: 10, y: 20,
  width: 120, height: 48, label: "中心ノード", importance: "medium" as const,
}];
const svgExport = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
  width: 184,
  height: 112,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useMapPngExport", () => {
  it("空マップでは警告して画像処理を始めず次の書き出しを許可する", async () => {
    const publishNotice = jest.fn();
    const rasterizePng = jest.fn(async () => new Blob(["png"]));
    const downloadPng = jest.fn();
    const createSvgExport = jest.fn()
      .mockReturnValueOnce(null)
      .mockReturnValue(svgExport);
    const { result } = renderHook(() => useMapPngExport({
      nodes: [], publishNotice, createSvgExport, rasterizePng, downloadPng,
    }));

    await act(async () => result.current.exportPng());

    expect(publishNotice).toHaveBeenCalledWith({
      kind: "warning", message: "書き出すノードがありません。",
    });
    expect(rasterizePng).not.toHaveBeenCalled();
    expect(downloadPng).not.toHaveBeenCalled();
    expect(result.current.isExportingPng).toBe(false);

    await act(async () => result.current.exportPng());

    expect(downloadPng).toHaveBeenCalledTimes(1);
    expect(result.current.isExportingPng).toBe(false);
  });

  it("共有SVGを指定寸法で変換しPNG Blobを.png名でダウンロードする", async () => {
    const pngBlob = new Blob(["png"], { type: "image/png" });
    const publishNotice = jest.fn();
    const createSvgExport = jest.fn(() => svgExport);
    const rasterizePng = jest.fn(async () => pngBlob);
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapPngExport({
      nodes, publishNotice, createSvgExport, rasterizePng, downloadPng,
    }));

    await act(async () => result.current.exportPng());

    expect(createSvgExport).toHaveBeenCalledWith(nodes);
    expect(rasterizePng).toHaveBeenCalledWith(
      '<svg xmlns="http://www.w3.org/2000/svg" />', 184, 112,
    );
    expect(downloadPng).toHaveBeenCalledTimes(1);
    expect(downloadPng).toHaveBeenCalledWith(
      pngBlob, expect.stringMatching(/^draw-my-map-\d{8}-\d{6}\.png$/),
    );
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "status", message: "PNGファイルを書き出しました。",
    });
    expect(result.current.isExportingPng).toBe(false);
  });

  it("変換中の同一tick連打を同期ガードし成功後に再実行できる", async () => {
    const pending = deferred<Blob>();
    const publishNotice = jest.fn();
    const createSvgExport = jest.fn(() => svgExport);
    const rasterizePng = jest.fn(() => pending.promise);
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapPngExport({
      nodes, publishNotice, createSvgExport, rasterizePng, downloadPng,
    }));
    let first!: Promise<void>;
    let second!: Promise<void>;

    act(() => {
      first = result.current.exportPng();
      second = result.current.exportPng();
    });

    expect(createSvgExport).toHaveBeenCalledTimes(1);
    expect(rasterizePng).toHaveBeenCalledTimes(1);
    expect(result.current.isExportingPng).toBe(true);
    expect(publishNotice).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(new Blob(["png"]));
      await Promise.all([first, second]);
    });

    expect(downloadPng).toHaveBeenCalledTimes(1);
    expect(result.current.isExportingPng).toBe(false);

    await act(async () => result.current.exportPng());

    expect(downloadPng).toHaveBeenCalledTimes(2);
  });

  it("非同期変換失敗を通知し処理中状態と同期ガードを解除する", async () => {
    const pending = deferred<Blob>();
    const publishNotice = jest.fn();
    const rasterizePng = jest.fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(new Blob(["png"]));
    const downloadPng = jest.fn();
    const { result } = renderHook(() => useMapPngExport({
      nodes, publishNotice, createSvgExport: () => svgExport, rasterizePng, downloadPng,
    }));
    let exporting!: Promise<void>;

    act(() => { exporting = result.current.exportPng(); });

    expect(result.current.isExportingPng).toBe(true);
    await act(async () => {
      pending.reject(new Error("rasterize failed"));
      await exporting;
    });

    expect(downloadPng).not.toHaveBeenCalled();
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "error", message: "PNGファイルを書き出せませんでした。",
    });
    expect(result.current.isExportingPng).toBe(false);

    await act(async () => result.current.exportPng());

    expect(downloadPng).toHaveBeenCalledTimes(1);
  });

  it.each(["create", "rasterize", "download"])("%sの同期例外を通知し再実行を許可する", async (failure) => {
    const publishNotice = jest.fn();
    let shouldFail = true;
    const downloadPng = jest.fn(() => {
      if (shouldFail && failure === "download") throw new Error("download failed");
    });
    const { result } = renderHook(() => useMapPngExport({
      nodes,
      publishNotice,
      createSvgExport: () => {
        if (shouldFail && failure === "create") throw new Error("create failed");
        return svgExport;
      },
      rasterizePng: () => {
        if (shouldFail && failure === "rasterize") throw new Error("rasterize failed");
        return Promise.resolve(new Blob(["png"]));
      },
      downloadPng,
    }));

    await act(async () => result.current.exportPng());

    expect(publishNotice).toHaveBeenLastCalledWith({
      kind: "error", message: "PNGファイルを書き出せませんでした。",
    });
    expect(result.current.isExportingPng).toBe(false);
    shouldFail = false;
    await act(async () => result.current.exportPng());

    expect(publishNotice).toHaveBeenLastCalledWith({
      kind: "status", message: "PNGファイルを書き出しました。",
    });
    expect(result.current.isExportingPng).toBe(false);
  });
});
