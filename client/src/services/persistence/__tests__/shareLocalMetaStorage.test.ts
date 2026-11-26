import { encodeShareLocalMetaStore } from "@/domain/share/shareLocalMeta";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  SHARE_LOCAL_META_STORAGE_KEY,
  clearShareLocalMetaForMap,
  readShareLocalMeta,
  writeShareLocalMetaForMap,
} from "@/services/persistence/shareLocalMetaStorage";

const SAMPLE = {
  sharedMapId: "sm-1",
  lastPublishedAt: "2026-11-26T00:00:00.000Z" as string | null,
  linkActive: true,
};

describe("shareLocalMetaStorage", () => {
  it("キー定数が設計どおり", () => {
    expect(SHARE_LOCAL_META_STORAGE_KEY).toBe("draw-my-map.share-local-meta.v1");
  });

  it("未作成キーは missing（未共有）で書き込まない", () => {
    const { storage, operations } = createRecordingStorage();
    expect(readShareLocalMeta(storage, "map-1")).toEqual({ status: "missing" });
    expect(operations).toEqual([]);
  });

  it("書き込み後に present で読める", () => {
    const { storage } = createRecordingStorage();
    expect(writeShareLocalMetaForMap(storage, "map-1", SAMPLE)).toEqual({ status: "ok" });
    expect(readShareLocalMeta(storage, "map-1")).toEqual({
      status: "present",
      value: SAMPLE,
    });
  });

  it("破損ストアは read-error で、write は上書きしない（L-002）", () => {
    const { storage, operations } = createRecordingStorage({
      initial: { [SHARE_LOCAL_META_STORAGE_KEY]: "{broken" },
    });
    expect(readShareLocalMeta(storage, "map-1")).toEqual({
      status: "read-error",
      error: "corrupt",
    });
    expect(writeShareLocalMetaForMap(storage, "map-1", SAMPLE)).toEqual({
      status: "skipped-read-error",
      error: "corrupt",
    });
    expect(storage.getItem(SHARE_LOCAL_META_STORAGE_KEY)).toBe("{broken");
    expect(operations.filter((op) => op.type === "setItem")).toEqual([]);
  });

  it("getItem 例外は read-error（未共有に倒さない）", () => {
    const { storage } = createRecordingStorage();
    jest.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readShareLocalMeta(storage, "map-1")).toEqual({
      status: "read-error",
      error: "blocked",
    });
  });

  it("listState error 相当: 既存メタを clear しようとしても読取失敗なら残す", () => {
    const { storage } = createRecordingStorage({
      initial: {
        [SHARE_LOCAL_META_STORAGE_KEY]: encodeShareLocalMetaStore({
          version: 1,
          byMapId: { "map-1": SAMPLE },
        }),
      },
    });
    jest.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("offline");
    });
    expect(clearShareLocalMetaForMap(storage, "map-1")).toEqual({
      status: "skipped-read-error",
      error: "offline",
    });
  });
});
