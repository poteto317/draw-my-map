import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { useMapJsonImport } from "@/hooks/useMapJsonImport";
import type { MapDocumentResult } from "@/types/mapDocument";

const importedMapJson = `{
  "version": 3,
  "layoutMode": "auto",
  "nodes": []
}\n`;

const newerMapJson = `{
  "version": 3,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 20,
      "parentId": null,
      "x": 40,
      "y": 50,
      "width": 160,
      "height": 64,
      "label": "新しい選択",
      "importance": "medium"
    }
  ]
}\n`;

function deferredRead() {
  let resolve!: (result: MapDocumentResult<string>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<MapDocumentResult<string>>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useMapJsonImport", () => {
  it("検証済みsnapshotの保存を要求してマップを置換する", async () => {
    const requestSnapshotSave = jest.fn();
    const replaceMap = jest.fn();
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapJsonImport({
      replaceMap,
      requestSnapshotSave,
      publishNotice,
      readFile: jest.fn().mockResolvedValue({
        ok: true,
        value: importedMapJson,
      }),
    }));

    await act(async () => result.current(new File([], "map.json")));

    expect(requestSnapshotSave).toHaveBeenCalledWith(importedMapJson);
    expect(replaceMap).toHaveBeenCalledWith({
      layoutMode: "auto",
      nodes: [],
    });
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "マップを読み込みました。",
    });
  });

  it("並行読取が逆順に完了しても最後に選んだファイルだけを反映する", async () => {
    const firstRead = deferredRead();
    const secondRead = deferredRead();
    const requestSnapshotSave = jest.fn();
    const replaceMap = jest.fn();
    const publishNotice = jest.fn();
    const readFile = jest.fn()
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(secondRead.promise);
    const { result } = renderHook(() => useMapJsonImport({
      replaceMap,
      requestSnapshotSave,
      publishNotice,
      readFile,
    }));

    let firstImport!: Promise<void>;
    let secondImport!: Promise<void>;
    act(() => {
      firstImport = result.current(new File([], "first.json"));
      secondImport = result.current(new File([], "second.json"));
    });
    await act(async () => {
      secondRead.resolve({ ok: true, value: newerMapJson });
      await secondImport;
    });
    await act(async () => {
      firstRead.resolve({ ok: true, value: importedMapJson });
      await firstImport;
    });

    expect(requestSnapshotSave).toHaveBeenCalledTimes(1);
    expect(requestSnapshotSave).toHaveBeenCalledWith(newerMapJson);
    expect(replaceMap).toHaveBeenCalledTimes(1);
    expect(replaceMap).toHaveBeenCalledWith({
      layoutMode: "manual",
      nodes: [{
        id: 20,
        parentId: null,
        x: 40,
        y: 50,
        width: 160,
        height: 64,
        label: "新しい選択",
        importance: "medium" as const,
      }],
    });
    expect(publishNotice).toHaveBeenCalledTimes(1);
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "マップを読み込みました。",
    });
  });

  describe("読み込めないとき", () => {
    function renderImport(readFile: (file: File) => Promise<MapDocumentResult<string>>) {
      const requestSnapshotSave = jest.fn();
      const replaceMap = jest.fn();
      const publishNotice = jest.fn();
      const { result } = renderHook(() => useMapJsonImport({
        replaceMap,
        requestSnapshotSave,
        publishNotice,
        readFile,
      }));
      return { result, requestSnapshotSave, replaceMap, publishNotice };
    }

    it("読み取りが例外なら、マップを変えずに読み取れなかった旨の error を出す", async () => {
      const { result, requestSnapshotSave, replaceMap, publishNotice } = renderImport(
        jest.fn().mockRejectedValue(new Error("read failed")),
      );

      await act(async () => result.current(new File([], "map.json")));

      expect(publishNotice).toHaveBeenCalledWith({
        kind: "error",
        message: "JSONファイルを読み取れませんでした。現在のマップは変更されていません。",
      });
      expect(requestSnapshotSave).not.toHaveBeenCalled();
      expect(replaceMap).not.toHaveBeenCalled();
    });

    it("読み取りの失敗は、その理由に変更していない旨を続けた error にする", async () => {
      const { result, requestSnapshotSave, replaceMap, publishNotice } = renderImport(
        jest.fn().mockResolvedValue({ ok: false, error: "ファイルが大きすぎます。" }),
      );

      await act(async () => result.current(new File([], "map.json")));

      expect(publishNotice).toHaveBeenCalledWith({
        kind: "error",
        message: "ファイルが大きすぎます。現在のマップは変更されていません。",
      });
      expect(requestSnapshotSave).not.toHaveBeenCalled();
      expect(replaceMap).not.toHaveBeenCalled();
    });

    it("マップの形式でないJSONは、保存も置き換えもせずに error を出す", async () => {
      const { result, requestSnapshotSave, replaceMap, publishNotice } = renderImport(
        jest.fn().mockResolvedValue({ ok: true, value: "{\"version\": 999}" }),
      );

      await act(async () => result.current(new File([], "map.json")));

      expect(publishNotice).toHaveBeenCalledTimes(1);
      expect(publishNotice).toHaveBeenCalledWith({
        kind: "error",
        message: expect.stringMatching(/現在のマップは変更されていません。$/),
      });
      expect(requestSnapshotSave).not.toHaveBeenCalled();
      expect(replaceMap).not.toHaveBeenCalled();
    });

    it("後から選んだファイルがあると、前の読み取りの例外では通知しない", async () => {
      const firstRead = deferredRead();
      const readFile = jest.fn()
        .mockReturnValueOnce(firstRead.promise)
        .mockResolvedValueOnce({ ok: true, value: newerMapJson });
      const { result, replaceMap, publishNotice } = renderImport(readFile);

      let firstImport!: Promise<void>;
      act(() => {
        firstImport = result.current(new File([], "first.json"));
      });
      await act(async () => result.current(new File([], "second.json")));
      await act(async () => {
        firstRead.reject(new Error("read failed"));
        await firstImport;
      });

      expect(replaceMap).toHaveBeenCalledTimes(1);
      expect(publishNotice).toHaveBeenCalledTimes(1);
      expect(publishNotice).toHaveBeenCalledWith({
        kind: "status",
        message: "マップを読み込みました。",
      });
    });
  });

  describe("アンマウント後の読み取り結果", () => {
    const outcomes = [
      ["成功", (read: ReturnType<typeof deferredRead>) => read.resolve({ ok: true, value: importedMapJson })],
      ["失敗", (read: ReturnType<typeof deferredRead>) => read.resolve({ ok: false, error: "読み込めません。" })],
      ["例外", (read: ReturnType<typeof deferredRead>) => read.reject(new Error("read failed"))],
    ] as const;

    it.each(outcomes)("読み取りが%sで解決しても何も呼ばない", async (_name, settle) => {
      const read = deferredRead();
      const requestSnapshotSave = jest.fn();
      const replaceMap = jest.fn();
      const publishNotice = jest.fn();
      const { result, unmount } = renderHook(() => useMapJsonImport({
        replaceMap,
        requestSnapshotSave,
        publishNotice,
        readFile: jest.fn().mockReturnValue(read.promise),
      }));
      let importing!: Promise<void>;

      act(() => { importing = result.current(new File([], "map.json")); });
      unmount();
      await act(async () => {
        settle(read);
        await importing;
      });

      expect(replaceMap).not.toHaveBeenCalled();
      expect(requestSnapshotSave).not.toHaveBeenCalled();
      expect(publishNotice).not.toHaveBeenCalled();
    });
  });

  it("StrictModeでアンマウントしていなければ結果を反映する", async () => {
    const requestSnapshotSave = jest.fn();
    const replaceMap = jest.fn();
    const publishNotice = jest.fn();
    const { result } = renderHook(() => useMapJsonImport({
      replaceMap,
      requestSnapshotSave,
      publishNotice,
      readFile: jest.fn().mockResolvedValue({ ok: true, value: importedMapJson }),
    }), { wrapper: StrictMode });

    await act(async () => result.current(new File([], "map.json")));

    expect(requestSnapshotSave).toHaveBeenCalledWith(importedMapJson);
    expect(replaceMap).toHaveBeenCalledTimes(1);
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "マップを読み込みました。",
    });
  });
});
