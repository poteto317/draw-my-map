import { act, renderHook } from "@testing-library/react";
import { useMapJsonImport } from "@/hooks/useMapJsonImport";
import type { MapDocumentResult } from "@/types/mapDocument";

const importedMapJson = `{
  "version": 1,
  "layoutMode": "auto",
  "nodes": []
}\n`;

const newerMapJson = `{
  "version": 1,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 20,
      "parentId": null,
      "x": 40,
      "y": 50,
      "width": 160,
      "height": 64,
      "label": "新しい選択"
    }
  ]
}\n`;

function deferredRead() {
  let resolve!: (result: MapDocumentResult<string>) => void;
  const promise = new Promise<MapDocumentResult<string>>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
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
      }],
    });
    expect(publishNotice).toHaveBeenCalledTimes(1);
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "マップを読み込みました。",
    });
  });
});
