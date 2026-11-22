import { encodePartsStore } from "@/domain/parts/partsCodec";
import { createEmptyPartsStore, type PartsStore } from "@/domain/parts/partsModel";
import { createTestNode } from "@/testing/createTestNode";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  PARTS_STORAGE_KEY,
  readParts,
  writeParts,
} from "@/services/persistence/partsStorage";

const SAMPLE_STORE: PartsStore = {
  version: 1,
  parts: [
    {
      id: "part-1",
      name: "部品",
      createdAt: "2026-11-22T00:00:00.000Z",
      nodes: [
        createTestNode({ id: 1, parentId: null, label: "根" }),
        createTestNode({ id: 2, parentId: 1, label: "子" }),
      ],
    },
  ],
};

describe("partsStorage", () => {
  it("ストレージキー定数が設計どおりである", () => {
    expect(PARTS_STORAGE_KEY).toBe("draw-my-map.parts.v1");
  });

  describe("readParts", () => {
    it("キー未作成は空ストアを status: ok・repaired: false で返し書き込まない", () => {
      const { storage, operations } = createRecordingStorage();
      const result = readParts(storage);
      expect(result).toEqual({
        status: "ok",
        store: createEmptyPartsStore(),
        repaired: false,
      });
      expect(operations).toEqual([]);
      if (result.status !== "ok") return;
      result.store.parts.push(SAMPLE_STORE.parts[0]);
      expect(readParts(storage)).toEqual({
        status: "ok",
        store: { version: 1, parts: [] },
        repaired: false,
      });
    });

    it("保存済みストアを読み取れる", () => {
      const { storage } = createRecordingStorage({
        initial: { [PARTS_STORAGE_KEY]: encodePartsStore(SAMPLE_STORE) },
      });
      expect(readParts(storage)).toEqual({
        status: "ok",
        store: SAMPLE_STORE,
        repaired: false,
      });
    });

    it("破損データは corrupt を返し空成功にしない（L-002）", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [PARTS_STORAGE_KEY]: "{broken" },
      });
      expect(readParts(storage)).toEqual({ status: "corrupt" });
      expect(operations).toEqual([]);
      expect(storage.getItem(PARTS_STORAGE_KEY)).toBe("{broken");
    });

    it("部分破損は除外して repaired: true", () => {
      const { storage, operations } = createRecordingStorage({
        initial: {
          [PARTS_STORAGE_KEY]: JSON.stringify({
            version: 1,
            parts: [
              SAMPLE_STORE.parts[0],
              { id: "x", name: "坏", createdAt: "t", nodes: null },
            ],
          }),
        },
      });
      expect(readParts(storage)).toEqual({
        status: "ok",
        store: SAMPLE_STORE,
        repaired: true,
      });
      expect(operations).toEqual([]);
    });

    it("getItem 例外は read-error（L-002）", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });
      expect(readParts(storage)).toEqual({ status: "read-error" });
    });
  });

  describe("writeParts", () => {
    it("書き込み成功", () => {
      const { storage, operations } = createRecordingStorage();
      expect(writeParts(storage, SAMPLE_STORE)).toEqual({ status: "ok" });
      expect(readParts(storage)).toEqual({
        status: "ok",
        store: SAMPLE_STORE,
        repaired: false,
      });
      expect(operations).toEqual([
        {
          type: "setItem",
          key: PARTS_STORAGE_KEY,
          value: encodePartsStore(SAMPLE_STORE),
        },
      ]);
    });

    it("容量超過は quota-exceeded", () => {
      const { storage } = createRecordingStorage({
        failSetItem: () => true,
      });
      expect(writeParts(storage, SAMPLE_STORE)).toEqual({
        status: "quota-exceeded",
      });
    });

    it("その他の書込失敗は write-error", () => {
      const { storage } = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "SecurityError",
      });
      expect(writeParts(storage, SAMPLE_STORE)).toEqual({
        status: "write-error",
      });
    });
  });
});
