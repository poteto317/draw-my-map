import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useMapStorageRestoration } from "@/hooks/useMapStorageRestoration";
import { createTestStorageSession } from "@/testing/createTestStorageSession";

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
  it("effect前の初期状態は未復元で由来がない", () => {
    function Probe() {
      const restoration = useMapStorageRestoration({
        currentSnapshot: emptyMapJson,
        replaceMap: jest.fn(),
        publishNotice: jest.fn(),
        readBody: createTestStorageSession({ initialJson: null }).session.readBody,
      });
      return <div
        data-hydrated={String(restoration.hydrated)}
        data-snapshot={String(restoration.initialPersistedSnapshot)}
        data-origin={String(restoration.restoreOrigin)}
      />;
    }
    const markup = renderToString(<Probe />);
    expect(markup).toContain('data-hydrated="false"');
    expect(markup).toContain('data-snapshot="null"');
    expect(markup).toContain('data-origin="null"');
  });

  it("V1保存値を復元しV2移行保存のため元のsnapshotを基準にする", () => {
    const replaceMap = jest.fn();
    const { result } = renderHook(() => useMapStorageRestoration({
      currentSnapshot: emptyMapJson,
      replaceMap,
      publishNotice: jest.fn(),
      readBody: createTestStorageSession({ initialJson: legacyMapJson }).session.readBody,
    }));

    expect(result.current).toEqual({
      hydrated: true,
      initialPersistedSnapshot: legacyMapJson,
      restoreOrigin: "restored",
    });
    expect(replaceMap).toHaveBeenCalledWith({
      layoutMode: "auto",
      nodes: [expect.objectContaining({ id: 10, importance: "medium" })],
    });
  });

  it.each([2, 3])("V%i保存値はV3正規化snapshotを基準にする", (version) => {
    const storedJson = JSON.stringify({ version, layoutMode: "manual", nodes: [] });
    const replaceMap = jest.fn();
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapStorageRestoration({
      currentSnapshot: emptyMapJson,
      replaceMap,
      publishNotice,
      readBody: createTestStorageSession({ initialJson: storedJson }).session.readBody,
    }));

    expect(result.current).toEqual({
      hydrated: true,
      initialPersistedSnapshot: '{\n  "version": 3,\n  "layoutMode": "manual",\n  "nodes": []\n}\n',
      restoreOrigin: "restored",
    });
    expect(replaceMap).toHaveBeenCalledWith({ layoutMode: "manual", nodes: [] });
    expect(publishNotice).not.toHaveBeenCalled();
  });

  it("不正な保存値では現在snapshotを基準にして警告する", () => {
    const publishNotice = jest.fn();
    const replaceMap = jest.fn();
    const { result } = renderHook(() => useMapStorageRestoration({
      currentSnapshot: emptyMapJson,
      replaceMap,
      publishNotice,
      readBody: createTestStorageSession({ initialJson: "{broken" }).session.readBody,
    }));

    expect(result.current).toEqual({
      hydrated: true,
      initialPersistedSnapshot: emptyMapJson,
      restoreOrigin: "failed",
    });
    expect(replaceMap).not.toHaveBeenCalled();
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "warning",
      message: "保存データを復元できませんでした。空のマップで開始します。",
    });
  });

  it("保存データを読み取れないときは現在snapshotを基準にして警告する", () => {
    const publishNotice = jest.fn();
    const replaceMap = jest.fn();
    const { result } = renderHook(() => useMapStorageRestoration({
      currentSnapshot: emptyMapJson,
      replaceMap,
      publishNotice,
      readBody: createTestStorageSession({
        readError: "ブラウザの保存データを読み取れませんでした。",
      }).session.readBody,
    }));

    expect(result.current).toEqual({
      hydrated: true,
      initialPersistedSnapshot: emptyMapJson,
      restoreOrigin: "failed",
    });
    expect(replaceMap).not.toHaveBeenCalled();
    expect(publishNotice).toHaveBeenCalledTimes(1);
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "warning",
      message: "保存データを復元できませんでした。空のマップで開始します。",
    });
  });

  it("保存データが無いときは通知せず現在snapshotを基準にする", () => {
    const publishNotice = jest.fn();
    const replaceMap = jest.fn();
    const { result } = renderHook(() => useMapStorageRestoration({
      currentSnapshot: emptyMapJson,
      replaceMap,
      publishNotice,
      readBody: createTestStorageSession({ initialJson: null }).session.readBody,
    }));

    expect(result.current).toEqual({
      hydrated: true,
      initialPersistedSnapshot: emptyMapJson,
      restoreOrigin: "empty",
    });
    expect(replaceMap).not.toHaveBeenCalled();
    expect(publishNotice).not.toHaveBeenCalled();
  });
});
