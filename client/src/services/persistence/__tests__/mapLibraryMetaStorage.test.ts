import {
  createEmptyMapLibraryMeta,
  encodeMapLibraryMeta,
  type MapLibraryMetaV1,
} from "@/domain/mapLibrary/mapLibraryMeta";
import { MAP_INDEX_STORAGE_KEY } from "@/services/persistence/mapLibraryStorage";
import {
  MAP_LIBRARY_META_STORAGE_KEY,
  readMapLibraryMeta,
  resetMapLibraryMeta,
  writeMapLibraryMeta,
} from "@/services/persistence/mapLibraryMetaStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

const T1 = "2026-11-01T00:00:00.000Z";
const T2 = "2026-11-02T00:00:00.000Z";

const SAMPLE_META: MapLibraryMetaV1 = {
  version: 1,
  folders: [
    { id: "f-1", name: "仕事", createdAt: T1, updatedAt: T2 },
  ],
  mapMeta: {
    "map-1": { favorite: true, lastOpenedAt: T2, folderId: "f-1" },
    "map-2": { lastOpenedAt: T1 },
  },
};

describe("mapLibraryMetaStorage", () => {
  it("ストレージキー定数が設計どおりである", () => {
    expect(MAP_LIBRARY_META_STORAGE_KEY).toBe("draw-my-map.library-meta.v1");
  });

  describe("readMapLibraryMeta", () => {
    it("キー未作成（null）のときは書き込みを行わず空メタを repaired: false で返す", () => {
      const { storage, operations } = createRecordingStorage();

      expect(readMapLibraryMeta(storage)).toEqual({
        ok: true,
        meta: createEmptyMapLibraryMeta(),
        repaired: false,
      });
      expect(operations).toEqual([]);
    });

    it("保存済みの正常メタデータを読み取れる", () => {
      const { storage } = createRecordingStorage({
        initial: {
          [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta(SAMPLE_META),
        },
      });

      expect(readMapLibraryMeta(storage)).toEqual({
        ok: true,
        meta: SAMPLE_META,
        repaired: false,
      });
    });

    it("孤立 folderId を含む修復可能なメタデータは自動上書きせず repaired: true で返す", () => {
      const { storage, operations } = createRecordingStorage({
        initial: {
          [MAP_LIBRARY_META_STORAGE_KEY]: JSON.stringify({
            version: 1,
            folders: [],
            mapMeta: {
              "map-1": { favorite: true, folderId: "removed-folder" },
            },
          }),
        },
      });

      expect(readMapLibraryMeta(storage)).toEqual({
        ok: true,
        meta: {
          version: 1,
          folders: [],
          mapMeta: { "map-1": { favorite: true } },
        },
        repaired: true,
      });
      expect(operations).toEqual([]);
    });

    it("破損データ（不正 JSON・未知キー等）は上書きせず corrupt を返す（L-002）", () => {
      const brokenJson = createRecordingStorage({
        initial: { [MAP_LIBRARY_META_STORAGE_KEY]: "{broken" },
      });
      expect(readMapLibraryMeta(brokenJson.storage)).toEqual({
        ok: false,
        reason: "corrupt",
      });
      expect(brokenJson.operations).toEqual([]);
      expect(brokenJson.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{broken");

      const unknownKey = createRecordingStorage({
        initial: {
          [MAP_LIBRARY_META_STORAGE_KEY]: JSON.stringify({
            version: 1,
            folders: [],
            mapMeta: {},
            extra: true,
          }),
        },
      });
      expect(readMapLibraryMeta(unknownKey.storage)).toEqual({
        ok: false,
        reason: "corrupt",
      });
    });

    it("getItem が例外を投げるときは read-error を返す（L-002, L-056）", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });

      expect(readMapLibraryMeta(storage)).toEqual({
        ok: false,
        reason: "read-error",
      });
    });
  });

  describe("writeMapLibraryMeta", () => {
    it("メタデータを保存して readMapLibraryMeta で往復できる", () => {
      const { storage, entries } = createRecordingStorage();

      expect(writeMapLibraryMeta(storage, SAMPLE_META)).toEqual({ ok: true });
      expect(entries()).toEqual({
        [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta(SAMPLE_META),
      });
      expect(readMapLibraryMeta(storage)).toEqual({
        ok: true,
        meta: SAMPLE_META,
        repaired: false,
      });
    });

    it("QuotaExceededError 発生時は quota を返す（L-001, L-056）", () => {
      const { storage } = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "QuotaExceededError",
      });

      expect(writeMapLibraryMeta(storage, SAMPLE_META)).toEqual({
        ok: false,
        reason: "quota",
      });
    });

    it("その他の書き込み例外発生時は write-error を返す（L-001, L-056）", () => {
      const { storage } = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "SecurityError",
      });

      expect(writeMapLibraryMeta(storage, SAMPLE_META)).toEqual({
        ok: false,
        reason: "write-error",
      });
    });
  });

  describe("resetMapLibraryMeta", () => {
    it("破損したメタデータを空の MapLibraryMetaV1 で上書きし、他のキーには触れない", () => {
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: '{"version":1}',
          [MAP_LIBRARY_META_STORAGE_KEY]: "{broken",
        },
      });

      expect(resetMapLibraryMeta(storage)).toEqual({ ok: true });
      expect(entries()).toEqual({
        [MAP_INDEX_STORAGE_KEY]: '{"version":1}',
        [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta(
          createEmptyMapLibraryMeta(),
        ),
      });
      expect(readMapLibraryMeta(storage)).toEqual({
        ok: true,
        meta: createEmptyMapLibraryMeta(),
        repaired: false,
      });
    });

    it("初期化時の書き込み失敗も quota / write-error として返す", () => {
      const quotaFail = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "QuotaExceededError",
      });
      expect(resetMapLibraryMeta(quotaFail.storage)).toEqual({
        ok: false,
        reason: "quota",
      });

      const otherFail = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "SecurityError",
      });
      expect(resetMapLibraryMeta(otherFail.storage)).toEqual({
        ok: false,
        reason: "write-error",
      });
    });
  });
});
