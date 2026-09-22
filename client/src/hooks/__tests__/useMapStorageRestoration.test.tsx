import { renderHook } from "@testing-library/react";
import { useMapStorageRestoration } from "@/hooks/useMapStorageRestoration";

const emptyMapJson = `{
  "version": 1,
  "layoutMode": "manual",
  "nodes": []
}\n`;

describe("useMapStorageRestoration", () => {
  it("不正な保存値では現在snapshotを基準にして警告する", () => {
    const publishNotice = jest.fn();
    const replaceMap = jest.fn();
    const { result } = renderHook(() => useMapStorageRestoration({
      currentSnapshot: emptyMapJson,
      replaceMap,
      publishNotice,
      storage: {
        getItem: jest.fn(() => "{broken"),
      },
    }));

    expect(result.current).toEqual({
      hydrated: true,
      initialPersistedSnapshot: emptyMapJson,
    });
    expect(replaceMap).not.toHaveBeenCalled();
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "warning",
      message: "保存データを復元できませんでした。空のマップで開始します。",
    });
  });
});
