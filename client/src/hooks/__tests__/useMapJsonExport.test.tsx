import { act, renderHook } from "@testing-library/react";
import { useMapJsonExport } from "@/hooks/useMapJsonExport";

describe("useMapJsonExport", () => {
  it("download例外を利用者向け通知へ変換する", () => {
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapJsonExport({
      currentSnapshot: "{}\n",
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
});
