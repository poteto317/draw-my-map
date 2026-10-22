import { act, renderHook } from "@testing-library/react";
import { useMapJsonExport } from "@/hooks/useMapJsonExport";

describe("useMapJsonExport", () => {
  it("download例外を利用者向け通知へ変換する", () => {
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapJsonExport({
      currentSnapshot: "{}\n",
      mapName: "旅行",
      publishNotice,
      downloadJson: () => {
        throw new Error("download failed");
      },
    }));

    act(() => result.current());

    expect(publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: "JSONファイルを書き出せませんでした。",
    });
  });

  it("現在のsnapshotとマップ名でdownloadJsonを呼ぶ", () => {
    const downloadJson = jest.fn();
    const { result } = renderHook(() => useMapJsonExport({
      currentSnapshot: "{}\n",
      mapName: "旅行",
      publishNotice: jest.fn(),
      downloadJson,
    }));

    act(() => result.current());

    expect(downloadJson).toHaveBeenCalledWith("{}\n", "旅行");
  });

  it("mapNameを変えて再描画すると次の書き出しに新しい名前を使う", () => {
    const downloadJson = jest.fn();
    const { result, rerender } = renderHook(
      ({ mapName }) => useMapJsonExport({
        currentSnapshot: "{}\n",
        mapName,
        publishNotice: jest.fn(),
        downloadJson,
      }),
      { initialProps: { mapName: "旅行" } },
    );

    act(() => result.current());
    rerender({ mapName: "仕事" });
    act(() => result.current());

    expect(downloadJson).toHaveBeenNthCalledWith(1, "{}\n", "旅行");
    expect(downloadJson).toHaveBeenNthCalledWith(2, "{}\n", "仕事");
  });
});
