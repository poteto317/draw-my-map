import {
  MAP_BODY_KEY_PREFIX,
  MAP_INDEX_BACKUP_STORAGE_KEY,
  MAP_INDEX_STORAGE_KEY,
  getBrowserMapLibraryStorage,
  hasMapBody,
  mapBodyKey,
  readMapBody,
  readMapLibrarySnapshot,
  removeLegacyMap,
  removeMapBody,
  writeCorruptIndexBackup,
  writeMapBody,
  writeMapIndex,
  writeMigratedMap,
} from "@/services/persistence/mapLibraryStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  createMapIndexEntry,
  createSingleMapIndex,
  encodeMapIndex,
} from "@/domain/mapLibrary/mapIndex";
import { MAP_STORAGE_KEY } from "@/services/persistence/mapStorage";

const index = createSingleMapIndex(
  createMapIndexEntry("abc", "マップ", "2026-01-01T00:00:00.000Z"),
  true,
);
const retryIndex = createSingleMapIndex(
  createMapIndexEntry("abc", "マップ", "2026-01-01T00:00:00.000Z"),
  false,
);

describe("mapLibraryStorage", () => {
  it("キーの定数と本体キーを組み立てる", () => {
    expect(MAP_INDEX_STORAGE_KEY).toBe("draw-my-map.maps.v1");
    expect(MAP_BODY_KEY_PREFIX).toBe("draw-my-map.maps.v1.doc.");
    expect(MAP_INDEX_BACKUP_STORAGE_KEY).toBe(
      "draw-my-map.maps.v1.corrupt-backup",
    );
    expect(mapBodyKey("abc")).toBe("draw-my-map.maps.v1.doc.abc");
  });

  describe("getBrowserMapLibraryStorage", () => {
    it("window.localStorage を返す", () => {
      expect(getBrowserMapLibraryStorage()).toBe(window.localStorage);
    });

    it("window.localStorage の取得が例外なら null を返す", () => {
      const spy = jest
        .spyOn(window, "localStorage", "get")
        .mockImplementation(() => {
          throw new DOMException("blocked", "SecurityError");
        });

      expect(getBrowserMapLibraryStorage()).toBeNull();
      spy.mockRestore();
    });
  });

  describe("readMapLibrarySnapshot", () => {
    it("storage が null なら unavailable", () => {
      expect(readMapLibrarySnapshot(null)).toEqual({ kind: "unavailable" });
    });

    it("読み取りが例外なら unavailable", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });

      expect(readMapLibrarySnapshot(storage)).toEqual({ kind: "unavailable" });
    });

    it("インデックスは読めても、旧キーの読み取りだけが例外なら unavailable", () => {
      const { storage } = createRecordingStorage({
        initial: { [MAP_INDEX_STORAGE_KEY]: "INDEX" },
      });
      const getItem = storage.getItem.bind(storage);
      jest.spyOn(storage, "getItem").mockImplementation((key: string) => {
        if (key === MAP_STORAGE_KEY) throw new DOMException("blocked", "SecurityError");
        return getItem(key);
      });

      expect(readMapLibrarySnapshot(storage)).toEqual({ kind: "unavailable" });
    });

    it("空の storage は何も無い available", () => {
      const { storage } = createRecordingStorage();

      expect(readMapLibrarySnapshot(storage)).toEqual({
        kind: "available",
        indexRaw: null,
        legacyRaw: null,
        bodyIds: [],
      });
    });

    it("インデックス・旧キーの値を返し、bodyIds は id の形式に合う本体だけにする", () => {
      const { storage } = createRecordingStorage({
        initial: {
          "draw-my-map.maps.v1": "INDEX",
          "draw-my-map.map.v1": "LEGACY",
          "draw-my-map.maps.v1.doc.a": "1",
          "draw-my-map.maps.v1.doc.b-2_": "2",
          "draw-my-map.maps.v1.corrupt-backup": "backup",
          "draw-my-map.maps.v1.doc.bad id": "x",
          other: "y",
        },
      });

      expect(readMapLibrarySnapshot(storage)).toEqual({
        kind: "available",
        indexRaw: "INDEX",
        legacyRaw: "LEGACY",
        bodyIds: ["a", "b-2_"],
      });
    });
  });

  describe("書き込み系は結果型で返し例外を投げない", () => {
    it("writeMapIndex", () => {
      const ok = createRecordingStorage();
      expect(writeMapIndex(ok.storage, index)).toEqual({ ok: true });
      expect(ok.entries()).toEqual({
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
      });

      const ng = createRecordingStorage({ failSetItem: () => true });
      expect(writeMapIndex(ng.storage, index)).toEqual({
        ok: false,
        error: expect.any(String),
      });
    });

    it("writeMapBody", () => {
      const ok = createRecordingStorage();
      expect(writeMapBody(ok.storage, "abc", "{}")).toEqual({ ok: true });
      expect(ok.entries()).toEqual({ [mapBodyKey("abc")]: "{}" });

      const ng = createRecordingStorage({ failSetItem: () => true });
      expect(writeMapBody(ng.storage, "abc", "{}")).toEqual({
        ok: false,
        error: expect.any(String),
      });
    });

    it("removeMapBody", () => {
      const ok = createRecordingStorage({
        initial: { [mapBodyKey("abc")]: "{}" },
      });
      expect(removeMapBody(ok.storage, "abc")).toEqual({ ok: true });
      expect(ok.entries()).toEqual({});

      const ng = createRecordingStorage({ failRemoveItem: () => true });
      expect(removeMapBody(ng.storage, "abc")).toEqual({
        ok: false,
        error: expect.any(String),
      });
    });

    it("writeCorruptIndexBackup", () => {
      const ok = createRecordingStorage();
      expect(writeCorruptIndexBackup(ok.storage, "RAW")).toEqual({ ok: true });
      expect(ok.entries()).toEqual({ [MAP_INDEX_BACKUP_STORAGE_KEY]: "RAW" });

      const ng = createRecordingStorage({ failSetItem: () => true });
      expect(writeCorruptIndexBackup(ng.storage, "RAW")).toEqual({
        ok: false,
        error: expect.any(String),
      });
    });

    it("removeLegacyMap", () => {
      const ok = createRecordingStorage({
        initial: { "draw-my-map.map.v1": "{}" },
      });
      expect(removeLegacyMap(ok.storage)).toEqual({ ok: true });
      expect(ok.entries()).toEqual({});

      const ng = createRecordingStorage({ failRemoveItem: () => true });
      expect(removeLegacyMap(ng.storage)).toEqual({
        ok: false,
        error: expect.any(String),
      });
    });
  });

  describe("readMapBody", () => {
    it("本体を返し、無ければ null、読み取り例外は ok:false", () => {
      const { storage } = createRecordingStorage({
        initial: { [mapBodyKey("abc")]: "{}" },
      });
      expect(readMapBody(storage, "abc")).toEqual({ ok: true, value: "{}" });
      expect(readMapBody(storage, "none")).toEqual({ ok: true, value: null });

      const ng = createRecordingStorage({ failGetItem: true });
      expect(readMapBody(ng.storage, "abc")).toEqual({
        ok: false,
        error: expect.any(String),
      });
    });
  });

  describe("hasMapBody", () => {
    it("本体ありは true、なしは false、読み取り例外は true", () => {
      const { storage } = createRecordingStorage({
        initial: { [mapBodyKey("abc")]: "{}" },
      });
      expect(hasMapBody(storage, "abc")).toBe(true);
      expect(hasMapBody(storage, "none")).toBe(false);

      const ng = createRecordingStorage({ failGetItem: true });
      expect(hasMapBody(ng.storage, "abc")).toBe(true);
    });
  });

  describe("writeMigratedMap", () => {
    const input = { bodyId: "abc", bodyJson: "{}", index, retryIndex, legacyRaw: "legacy" };

    it("成功では本体、インデックスの順に書き、旧キーには触れない", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: "legacy" },
      });

      expect(writeMigratedMap(storage, input)).toEqual({ ok: true, legacy: "kept" });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("abc"), value: "{}" },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(index),
        },
      ]);
    });

    it("QuotaExceededError 以外で本体の書き込みに失敗したら、やり直さずインデックスも旧キーも触れない", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: "legacy" },
        failSetItem: (key) => key === mapBodyKey("abc"),
        failSetItemError: "SecurityError",
      });

      expect(writeMigratedMap(storage, input)).toEqual({
        ok: false,
        failedStep: "body",
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("abc"), value: "{}" },
      ]);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: "legacy" });
    });

    it("QuotaExceededError 以外でインデックスの書き込みに失敗したら、本体を戻し、やり直さず旧キーには触れない", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: "legacy" },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        failSetItemError: "SecurityError",
      });

      expect(writeMigratedMap(storage, input)).toEqual({
        ok: false,
        failedStep: "index",
        rollback: "removed",
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("abc"), value: "{}" },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(index),
        },
        { type: "removeItem", key: mapBodyKey("abc") },
      ]);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: "legacy" });
    });

    it("インデックスが容量不足でも、本体を戻す操作に失敗したら、やり直さず rollback は failed", () => {
      const { storage, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: "legacy" },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        failRemoveItem: (key) => key === mapBodyKey("abc"),
      });

      expect(writeMigratedMap(storage, input)).toEqual({
        ok: false,
        failedStep: "index",
        rollback: "failed",
      });
      expect(entries()).toEqual({
        [MAP_STORAGE_KEY]: "legacy",
        [mapBodyKey("abc")]: "{}",
      });
    });

    describe("本体かインデックスの書き込みが容量不足で失敗したときのやり直し", () => {
      const legacyRaw = "l".repeat(600);
      const bodyJson = "b".repeat(600);
      const quotaInput = { ...input, bodyJson, legacyRaw };
      const size = (key: string, value: string) => key.length + value.length;
      const legacySize = size(MAP_STORAGE_KEY, legacyRaw);
      const bodySize = size(mapBodyKey("abc"), bodyJson);
      const retryIndexSize = size(MAP_INDEX_STORAGE_KEY, encodeMapIndex(retryIndex));

      it("旧キーが容量の半分を超えていると、旧キーを消して本体・P: false のインデックスを書き直す", () => {
        const capacity = bodySize + retryIndexSize;
        expect(legacySize + bodySize).toBeGreaterThan(capacity);
        const { storage, operations, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          capacity,
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: true,
          legacy: "removed",
        });
        expect(operations).toEqual([
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          { type: "removeItem", key: MAP_STORAGE_KEY },
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          {
            type: "setItem",
            key: MAP_INDEX_STORAGE_KEY,
            value: encodeMapIndex(retryIndex),
          },
        ]);
        expect(entries()).toEqual({
          [mapBodyKey("abc")]: bodyJson,
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(retryIndex),
        });
      });

      it("やり直しの本体の書き込みにも失敗したら、旧キーを元の文字列で書き戻す", () => {
        const { storage, operations, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          failSetItem: (key) => key === mapBodyKey("abc"),
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: false,
          failedStep: "retry",
          legacy: "restored",
          bodyRollback: "notNeeded",
        });
        expect(operations).toEqual([
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          { type: "removeItem", key: MAP_STORAGE_KEY },
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          { type: "setItem", key: MAP_STORAGE_KEY, value: legacyRaw },
        ]);
        expect(entries()).toEqual({ [MAP_STORAGE_KEY]: legacyRaw });
      });

      it("やり直しのインデックスの書き込みに失敗したら、本体を消してから旧キーを書き戻す", () => {
        // 本体だけなら入るが、本体とインデックスは入らない容量
        const capacity = bodySize + 5;
        expect(legacySize).toBeLessThanOrEqual(capacity);
        const { storage, operations, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          capacity,
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: false,
          failedStep: "retry",
          legacy: "restored",
          bodyRollback: "removed",
        });
        expect(operations).toEqual([
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          { type: "removeItem", key: MAP_STORAGE_KEY },
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          {
            type: "setItem",
            key: MAP_INDEX_STORAGE_KEY,
            value: encodeMapIndex(retryIndex),
          },
          { type: "removeItem", key: mapBodyKey("abc") },
          { type: "setItem", key: MAP_STORAGE_KEY, value: legacyRaw },
        ]);
        expect(entries()).toEqual({ [MAP_STORAGE_KEY]: legacyRaw });
      });

      it("書き戻しにも失敗したら legacy は lost で、旧キーは残らない", () => {
        const { storage, operations, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          failSetItem: (key) =>
            key === mapBodyKey("abc") || key === MAP_STORAGE_KEY,
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: false,
          failedStep: "retry",
          legacy: "lost",
          bodyRollback: "notNeeded",
        });
        expect(operations).toEqual([
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          { type: "removeItem", key: MAP_STORAGE_KEY },
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          { type: "setItem", key: MAP_STORAGE_KEY, value: legacyRaw },
        ]);
        expect(entries()).toEqual({});
      });

      it("インデックスの失敗で本体を消せず、書き戻しにも失敗したら、本体は孤立した本体として残る", () => {
        const { storage, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          capacity: bodySize + 5,
          failRemoveItem: (key) => key === mapBodyKey("abc"),
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: false,
          failedStep: "retry",
          legacy: "lost",
          bodyRollback: "failed",
        });
        expect(entries()).toEqual({ [mapBodyKey("abc")]: bodyJson });
      });

      it("旧キーを消せなければ、本体を書き直さず legacy は kept", () => {
        const { storage, operations, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          failSetItem: (key) => key === mapBodyKey("abc"),
          failRemoveItem: (key) => key === MAP_STORAGE_KEY,
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: false,
          failedStep: "retry",
          legacy: "kept",
          bodyRollback: "notNeeded",
        });
        expect(operations).toEqual([
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          { type: "removeItem", key: MAP_STORAGE_KEY },
        ]);
        expect(entries()).toEqual({ [MAP_STORAGE_KEY]: legacyRaw });
      });

      it("本体は入るがインデックスが容量不足なら、本体を消し、旧キーを消してから本体・P: false のインデックスを書き直す", () => {
        const capacity = legacySize + bodySize + 5;
        expect(capacity - legacySize - bodySize).toBeLessThan(retryIndexSize);
        expect(bodySize + retryIndexSize).toBeLessThanOrEqual(capacity);
        const { storage, operations, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          capacity,
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: true,
          legacy: "removed",
        });
        expect(operations).toEqual([
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          {
            type: "setItem",
            key: MAP_INDEX_STORAGE_KEY,
            value: encodeMapIndex(index),
          },
          { type: "removeItem", key: mapBodyKey("abc") },
          { type: "removeItem", key: MAP_STORAGE_KEY },
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          {
            type: "setItem",
            key: MAP_INDEX_STORAGE_KEY,
            value: encodeMapIndex(retryIndex),
          },
        ]);
        expect(entries()).toEqual({
          [mapBodyKey("abc")]: bodyJson,
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(retryIndex),
        });
      });

      it("インデックスの容量不足からのやり直しでもインデックスを書けなければ、本体を消して旧キーを書き戻す", () => {
        const { storage, operations, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
          failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        });

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: false,
          failedStep: "retry",
          legacy: "restored",
          bodyRollback: "removed",
        });
        expect(operations).toEqual([
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          {
            type: "setItem",
            key: MAP_INDEX_STORAGE_KEY,
            value: encodeMapIndex(index),
          },
          { type: "removeItem", key: mapBodyKey("abc") },
          { type: "removeItem", key: MAP_STORAGE_KEY },
          { type: "setItem", key: mapBodyKey("abc"), value: bodyJson },
          {
            type: "setItem",
            key: MAP_INDEX_STORAGE_KEY,
            value: encodeMapIndex(retryIndex),
          },
          { type: "removeItem", key: mapBodyKey("abc") },
          { type: "setItem", key: MAP_STORAGE_KEY, value: legacyRaw },
        ]);
        expect(entries()).toEqual({ [MAP_STORAGE_KEY]: legacyRaw });
      });

      it.each([
        ["code が 1014", "QuotaError", 1014],
        ["name が NS_ERROR_DOM_QUOTA_REACHED", "NS_ERROR_DOM_QUOTA_REACHED", 0],
      ])("古い Firefox の容量不足（%s）も容量不足として扱う", (_label, name, code) => {
        let calls = 0;
        const { storage, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
        });
        const originalSetItem = storage.setItem.bind(storage);
        storage.setItem = (key: string, value: string) => {
          calls += 1;
          if (calls === 1) {
            const error = new DOMException("full", name);
            Object.defineProperty(error, "code", { value: code });
            throw error;
          }
          originalSetItem(key, value);
        };

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: true,
          legacy: "removed",
        });
        expect(entries()).toEqual({
          [mapBodyKey("abc")]: bodyJson,
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(retryIndex),
        });
      });

      it("DOMException の code が 22 なら、name が違っても容量不足として扱う", () => {
        let calls = 0;
        const { storage, entries } = createRecordingStorage({
          initial: { [MAP_STORAGE_KEY]: legacyRaw },
        });
        const originalSetItem = storage.setItem.bind(storage);
        storage.setItem = (key: string, value: string) => {
          calls += 1;
          if (calls === 1) {
            const error = new DOMException("full", "QuotaError");
            Object.defineProperty(error, "code", { value: 22 });
            throw error;
          }
          originalSetItem(key, value);
        };

        expect(writeMigratedMap(storage, quotaInput)).toEqual({
          ok: true,
          legacy: "removed",
        });
        expect(entries()).toEqual({
          [mapBodyKey("abc")]: bodyJson,
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(retryIndex),
        });
      });
    });
  });
});
