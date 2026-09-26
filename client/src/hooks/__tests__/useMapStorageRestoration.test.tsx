import { renderHook } from "@testing-library/react";
import { useMapStorageRestoration } from "@/hooks/useMapStorageRestoration";

const emptyMapJson = `{
  "version": 2,
  "layoutMode": "manual",
  "nodes": []
}\n`;

const legacyMapJson = `{
  "version": 1,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "保存済み"
    }
  ]
}\n`;

describe("useMapStorageRestoration", () => {
  it("V1保存値を復元しV2移行保存のため元のsnapshotを基準にする", () => {
    const replaceMap = jest.fn();
    const { result } = renderHook(() => useMapStorageRestoration({
      currentSnapshot: emptyMapJson,
      replaceMap,
      publishNotice: jest.fn(),
      storage: { getItem: jest.fn(() => legacyMapJson) },
    }));

    expect(result.current).toEqual({
      hydrated: true,
      initialPersistedSnapshot: legacyMapJson,
    });
    expect(replaceMap).toHaveBeenCalledWith({
      layoutMode: "auto",
      nodes: [expect.objectContaining({ id: 10, importance: "medium" })],
    });
  });

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
