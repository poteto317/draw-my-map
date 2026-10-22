import { act, renderHook } from "@testing-library/react";
import { useMapFilePersistence } from "@/hooks/useMapFilePersistence";

const emptyMapJson = `{
  "version": 2,
  "layoutMode": "manual",
  "nodes": []
}\n`;

describe("useMapFilePersistence", () => {
  it("現在のsnapshotを書き出して通知する", () => {
    const downloadJson = jest.fn();
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapFilePersistence({
      currentSnapshot: emptyMapJson,
      mapName: "旅行",
      replaceMap: jest.fn(),
      requestSnapshotSave: jest.fn(),
      publishNotice,
      downloadJson,
      readFile: jest.fn(),
    }));

    act(() => result.current.exportJson());

    expect(downloadJson).toHaveBeenCalledWith(emptyMapJson, "旅行");
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "JSONファイルを書き出しました。",
    });
  });

  it("ファイル読み取り例外を通知して置換しない", async () => {
    const replaceMap = jest.fn();
    const requestSnapshotSave = jest.fn();
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapFilePersistence({
      currentSnapshot: emptyMapJson,
      mapName: "旅行",
      replaceMap,
      requestSnapshotSave,
      publishNotice,
      downloadJson: jest.fn(),
      readFile: jest.fn().mockRejectedValue(new Error("read failed")),
    }));

    await act(async () => result.current.importJsonFile(new File([], "map.json")));

    expect(replaceMap).not.toHaveBeenCalled();
    expect(requestSnapshotSave).not.toHaveBeenCalled();
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: "JSONファイルを読み取れませんでした。現在のマップは変更されていません。",
    });
  });
});
