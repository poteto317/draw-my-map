import { decodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "@/services/persistence/mapLibraryStorage";
import {
  activeMapBodyKey,
  createRecordingStorage,
  readActiveMapJson,
  readMapIndex,
  seedMapLibrary,
} from "@/testing/mapLibraryTestStorage";

describe("mapLibraryTestStorage", () => {
  describe("seedMapLibrary", () => {
    it("インデックスを正しい形で書き、json が null の項目は本体を書かない", () => {
      const { storage } = createRecordingStorage();

      const index = seedMapLibrary(storage, [
        { json: "{\"a\":1}" },
        { json: null },
      ]);

      const raw = storage.getItem(MAP_INDEX_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const decoded = decodeMapIndex(raw as string);
      expect(decoded).toEqual({ kind: "ok", index, repaired: false });
      expect(index.maps.map((map) => map.id)).toEqual(["map-1", "map-2"]);
      expect(index.maps.map((map) => map.name)).toEqual([
        "マップ 1",
        "マップ 2",
      ]);
      expect(index.currentMapId).toBe("map-1");
      expect(storage.getItem(mapBodyKey("map-1"))).toBe("{\"a\":1}");
      expect(storage.getItem(mapBodyKey("map-2"))).toBeNull();
    });

    it("currentMapId と legacyCleanupPending を指定できる", () => {
      const { storage } = createRecordingStorage();

      const index = seedMapLibrary(
        storage,
        [{ json: "{}" }, { id: "second", json: null }],
        { currentMapId: "second", legacyCleanupPending: true },
      );

      expect(index.currentMapId).toBe("second");
      expect(index.legacyCleanupPending).toBe(true);
    });
  });

  describe("readMapIndex", () => {
    it("書かれたインデックスをデコードして返し、無いか壊れていれば null を返す", () => {
      const { storage } = createRecordingStorage();
      expect(readMapIndex(storage)).toBeNull();

      const index = seedMapLibrary(storage, [{ json: "{}" }]);
      expect(readMapIndex(storage)).toEqual(index);

      storage.setItem(MAP_INDEX_STORAGE_KEY, "{");
      expect(readMapIndex(storage)).toBeNull();
    });
  });

  describe("readActiveMapJson / activeMapBodyKey", () => {
    it("現在のマップの本体を返し、本体が無ければ null を返す", () => {
      const { storage } = createRecordingStorage();
      seedMapLibrary(storage, [{ json: "{\"a\":1}" }, { json: null }]);
      expect(readActiveMapJson(storage)).toBe("{\"a\":1}");
      expect(activeMapBodyKey(storage)).toBe(mapBodyKey("map-1"));

      const second = createRecordingStorage();
      seedMapLibrary(second.storage, [{ json: "{\"a\":1}" }, { json: null }], {
        currentMapId: "map-2",
      });
      expect(readActiveMapJson(second.storage)).toBeNull();
    });

    it("インデックスが無ければ readActiveMapJson は null、activeMapBodyKey は例外", () => {
      const { storage } = createRecordingStorage();

      expect(readActiveMapJson(storage)).toBeNull();
      expect(() => activeMapBodyKey(storage)).toThrow();
    });
  });

  describe("createRecordingStorage", () => {
    it("Storage と同じく length・key・getItem の null・clear を持つ", () => {
      const { storage } = createRecordingStorage({ initial: { a: "1" } });

      expect(storage.length).toBe(1);
      expect(storage.key(0)).toBe("a");
      expect(storage.key(1)).toBeNull();
      expect(storage.getItem("missing")).toBeNull();
      storage.setItem("b", "2");
      expect(storage.length).toBe(2);
      storage.clear();
      expect(storage.length).toBe(0);
    });

    it("書き込みを記録し、entries で現在の内容を返す", () => {
      const { storage, operations, entries } = createRecordingStorage();

      storage.setItem("a", "1");
      storage.removeItem("a");

      expect(operations).toEqual([
        { type: "setItem", key: "a", value: "1" },
        { type: "removeItem", key: "a" },
      ]);
      expect(entries()).toEqual({});
    });

    it("failSetItem では値を変えず QuotaExceededError を投げる", () => {
      const { storage, entries } = createRecordingStorage({
        initial: { a: "old" },
        failSetItem: (key) => key === "a",
      });

      let caught: unknown;
      try {
        storage.setItem("a", "new");
      } catch (error) {
        caught = error;
      }

      expect((caught as DOMException).name).toBe("QuotaExceededError");
      expect(entries()).toEqual({ a: "old" });
    });

    it("failSetItemError を指定すると、失敗させた書き込みでその名前の例外を投げる", () => {
      const { storage, entries } = createRecordingStorage({
        initial: { a: "old" },
        failSetItem: (key) => key === "a",
        failSetItemError: "SecurityError",
      });

      let caught: unknown;
      try {
        storage.setItem("a", "new");
      } catch (error) {
        caught = error;
      }

      expect((caught as DOMException).name).toBe("SecurityError");
      expect(entries()).toEqual({ a: "old" });
    });

    it("capacity を超える書き込み（キーと値の文字数の合計）は値を変えず QuotaExceededError を投げ、記録はする", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { a: "12345" },
        capacity: 10,
      });

      // 置き換えは古い値を除いて数える: a(1) + 123456789(9) = 10
      storage.setItem("a", "123456789");
      let caught: unknown;
      try {
        storage.setItem("b", "1");
      } catch (error) {
        caught = error;
      }

      expect((caught as DOMException).name).toBe("QuotaExceededError");
      expect(operations).toEqual([
        { type: "setItem", key: "a", value: "123456789" },
        { type: "setItem", key: "b", value: "1" },
      ]);
      expect(entries()).toEqual({ a: "123456789" });

      storage.removeItem("a");
      storage.setItem("b", "1");
      expect(entries()).toEqual({ b: "1" });
    });

    it("failRemoveItem では値を残し例外を投げる", () => {
      const { storage, entries } = createRecordingStorage({
        initial: { a: "1" },
        failRemoveItem: () => true,
      });

      expect(() => storage.removeItem("a")).toThrow();
      expect(entries()).toEqual({ a: "1" });
    });

    it("failGetItem では getItem が例外を投げる", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });

      expect(() => storage.getItem("a")).toThrow();
    });

    it("beforeRemoveItem を削除の前に呼ぶ", () => {
      const seen: Array<string | null> = [];
      const { storage } = createRecordingStorage({
        initial: { a: "1" },
        beforeRemoveItem: () => {
          seen.push(storage.getItem("a"));
        },
      });

      storage.removeItem("a");

      expect(seen).toEqual(["1"]);
      expect(storage.getItem("a")).toBeNull();
    });
  });
});
