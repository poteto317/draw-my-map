import {
  encodeMapTrashIndex,
  type MapTrashEntry,
  type MapTrashIndexV1,
} from "@/domain/mapLibrary/mapTrash";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "@/services/persistence/mapLibraryStorage";
import {
  MAP_TRASH_BODY_KEY_PREFIX,
  MAP_TRASH_INDEX_KEY,
  collectTrashBodyKeys,
  forceClearCorruptTrash,
  mapTrashBodyKey,
  pickTrashId,
  purgeExpiredTrash,
  readMapTrashIndex,
  readMapTrashState,
  readTrashBody,
  removeMapTrashIndex,
  removeTrashBody,
  writeMapTrashIndex,
  writeTrashBody,
} from "@/services/persistence/mapTrashStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

const NOW = new Date("2026-11-15T00:00:00.000Z");

function makeTrashEntry(
  overrides: Partial<MapTrashEntry> & { id: string },
): MapTrashEntry {
  return {
    id: overrides.id,
    originalMapId: overrides.originalMapId ?? `orig-${overrides.id}`,
    name: overrides.name ?? `マップ ${overrides.id}`,
    createdAt: overrides.createdAt ?? "2026-10-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-10-10T00:00:00.000Z",
    deletedAt: overrides.deletedAt ?? "2026-11-10T00:00:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-12-10T00:00:00.000Z",
    hasBody: overrides.hasBody ?? true,
  };
}

function makeTrashIndex(items: MapTrashEntry[]): MapTrashIndexV1 {
  return { version: 1, items };
}

describe("mapTrashStorage", () => {
  it("キー定数とゴミ箱本体キーを組み立てる", () => {
    expect(MAP_TRASH_INDEX_KEY).toBe("draw-my-map.trash.v1");
    expect(MAP_TRASH_BODY_KEY_PREFIX).toBe("draw-my-map.trash.v1.doc.");
    expect(mapTrashBodyKey("trash-1")).toBe("draw-my-map.trash.v1.doc.trash-1");
  });

  describe("readMapTrashIndex", () => {
    it("キーが無ければ empty を返す", () => {
      const { storage } = createRecordingStorage();
      expect(readMapTrashIndex(storage)).toEqual({ kind: "empty" });
    });

    it("正常なインデックスを ok（repaired: false）で返す", () => {
      const index = makeTrashIndex([makeTrashEntry({ id: "t-1" })]);
      const raw = encodeMapTrashIndex(index);
      const { storage } = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: raw },
      });

      expect(readMapTrashIndex(storage)).toEqual({
        kind: "ok",
        index,
        raw,
        repaired: false,
      });
    });

    it("不正な行を含むが修復可能なインデックスは repaired: true で返す", () => {
      const valid = makeTrashEntry({ id: "t-1" });
      const raw = JSON.stringify({
        version: 1,
        items: [valid, { bad: true }],
      });
      const { storage } = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: raw },
      });

      expect(readMapTrashIndex(storage)).toEqual({
        kind: "ok",
        index: { version: 1, items: [valid] },
        raw,
        repaired: true,
      });
    });

    it("破損した JSON や version 不一致は corrupt を返す", () => {
      const broken = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: "{not-json" },
      });
      expect(readMapTrashIndex(broken.storage)).toEqual({
        kind: "corrupt",
        raw: "{not-json",
      });

      const wrongVersion = JSON.stringify({ version: 2, items: [] });
      const v2 = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: wrongVersion },
      });
      expect(readMapTrashIndex(v2.storage)).toEqual({
        kind: "corrupt",
        raw: wrongVersion,
      });
    });

    it("getItem が例外を投げるときは unavailable を返す", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });
      expect(readMapTrashIndex(storage)).toEqual({ kind: "unavailable" });
    });
  });

  describe("readMapTrashState", () => {
    it("empty は空配列の ok を返す", () => {
      const { storage } = createRecordingStorage();
      expect(readMapTrashState(storage)).toEqual({ status: "ok", entries: [] });
    });

    it("ok は表示順（deletedAt 降順）に並べ替えて返す", () => {
      const older = makeTrashEntry({
        id: "t-old",
        deletedAt: "2026-11-01T00:00:00.000Z",
      });
      const newer = makeTrashEntry({
        id: "t-new",
        deletedAt: "2026-11-12T00:00:00.000Z",
      });
      const { storage } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(
            makeTrashIndex([older, newer]),
          ),
        },
      });

      expect(readMapTrashState(storage)).toEqual({
        status: "ok",
        entries: [newer, older],
      });
    });

    it("corrupt と unavailable は corrupt を返す", () => {
      const broken = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: "{" },
      });
      expect(readMapTrashState(broken.storage)).toEqual({ status: "corrupt" });

      const unavailable = createRecordingStorage({ failGetItem: true });
      expect(readMapTrashState(unavailable.storage)).toEqual({
        status: "corrupt",
      });
    });
  });

  describe("writeMapTrashIndex / removeMapTrashIndex", () => {
    const index = makeTrashIndex([makeTrashEntry({ id: "t-1" })]);

    it("writeMapTrashIndex は成功・容量不足・その他失敗を区別して返す", () => {
      const ok = createRecordingStorage();
      expect(writeMapTrashIndex(ok.storage, index)).toEqual({ ok: true });
      expect(ok.entries()).toEqual({
        [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(index),
      });

      const quotaNg = createRecordingStorage({ failSetItem: () => true });
      expect(writeMapTrashIndex(quotaNg.storage, index)).toEqual({
        ok: false,
        quotaExceeded: true,
      });

      const otherNg = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "SecurityError",
      });
      expect(writeMapTrashIndex(otherNg.storage, index)).toEqual({
        ok: false,
        quotaExceeded: false,
      });
    });

    it("removeMapTrashIndex は成功時に true、例外時に false を返す", () => {
      const ok = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(index) },
      });
      expect(removeMapTrashIndex(ok.storage)).toBe(true);
      expect(ok.entries()).toEqual({});

      const ng = createRecordingStorage({ failRemoveItem: () => true });
      expect(removeMapTrashIndex(ng.storage)).toBe(false);
    });
  });

  describe("readTrashBody / writeTrashBody / removeTrashBody", () => {
    it("readTrashBody は本体・null・読取失敗を返す", () => {
      const { storage } = createRecordingStorage({
        initial: { [mapTrashBodyKey("t-1")]: '{"version":3}' },
      });
      expect(readTrashBody(storage, "t-1")).toEqual({
        ok: true,
        value: '{"version":3}',
      });
      expect(readTrashBody(storage, "none")).toEqual({ ok: true, value: null });

      const ng = createRecordingStorage({ failGetItem: true });
      expect(readTrashBody(ng.storage, "t-1")).toEqual({
        ok: false,
        error: expect.any(String),
      });
    });

    it("writeTrashBody は成功・容量不足・その他失敗を返す", () => {
      const ok = createRecordingStorage();
      expect(writeTrashBody(ok.storage, "t-1", "{}")).toEqual({ ok: true });
      expect(ok.entries()).toEqual({ [mapTrashBodyKey("t-1")]: "{}" });

      const quotaNg = createRecordingStorage({ failSetItem: () => true });
      expect(writeTrashBody(quotaNg.storage, "t-1", "{}")).toEqual({
        ok: false,
        quotaExceeded: true,
      });

      const otherNg = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "SecurityError",
      });
      expect(writeTrashBody(otherNg.storage, "t-1", "{}")).toEqual({
        ok: false,
        quotaExceeded: false,
      });
    });

    it("removeTrashBody は成功時に true、例外時に false を返す", () => {
      const ok = createRecordingStorage({
        initial: { [mapTrashBodyKey("t-1")]: "{}" },
      });
      expect(removeTrashBody(ok.storage, "t-1")).toBe(true);
      expect(ok.entries()).toEqual({});

      const ng = createRecordingStorage({ failRemoveItem: () => true });
      expect(removeTrashBody(ng.storage, "t-1")).toBe(false);
    });
  });

  describe("pickTrashId", () => {
    it("preferredId がインデックスにも本体にも無ければ再利用する", () => {
      const { storage } = createRecordingStorage();
      const generateId = jest.fn(() => "generated-1");

      expect(pickTrashId(storage, makeTrashIndex([]), "map-a", generateId)).toBe(
        "map-a",
      );
      expect(generateId).not.toHaveBeenCalled();
    });

    it("preferredId がゴミ箱インデックスに存在する場合は新しく採番する", () => {
      const { storage } = createRecordingStorage();
      const trashIndex = makeTrashIndex([makeTrashEntry({ id: "map-a" })]);
      const generateId = jest.fn(() => "trash-new");

      expect(pickTrashId(storage, trashIndex, "map-a", generateId)).toBe(
        "trash-new",
      );
      expect(generateId).toHaveBeenCalledTimes(1);
    });

    it("preferredId の孤立本体が存在する場合は新しく採番し、採番先も本体衝突を避ける", () => {
      const { storage } = createRecordingStorage({
        initial: {
          [mapTrashBodyKey("map-a")]: "{}",
          [mapTrashBodyKey("cand-1")]: "{}",
        },
      });
      const trashIndex = makeTrashIndex([makeTrashEntry({ id: "cand-2" })]);
      const candidates = ["cand-1", "cand-2", "cand-3"];
      let idx = 0;

      expect(
        pickTrashId(storage, trashIndex, "map-a", () => candidates[idx++] ?? "x"),
      ).toBe("cand-3");
    });

    it("readTrashBody が失敗するときは衝突とみなして採番し、すべて読取失敗なら null を返す", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });
      const generateId = jest.fn(() => "cand");

      expect(pickTrashId(storage, makeTrashIndex([]), "map-a", generateId)).toBeNull();
      expect(generateId).toHaveBeenCalled();
    });
  });

  describe("purgeExpiredTrash", () => {
    it("ゴミ箱キーが存在しない場合は書き込み・削除を一切行わず空配列を返す", () => {
      const { storage, operations } = createRecordingStorage();

      expect(purgeExpiredTrash(storage, NOW)).toEqual({
        status: "ok",
        entries: [],
      });
      expect(operations).toEqual([]);
    });

    it("破損または読取不可の場合は上書き・削除せず corrupt を返す", () => {
      const broken = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: "{}",
        },
      });
      expect(purgeExpiredTrash(broken.storage, NOW)).toEqual({
        status: "corrupt",
      });
      expect(broken.operations).toEqual([]);
      expect(broken.entries()).toEqual({
        [MAP_TRASH_INDEX_KEY]: "{broken",
        [mapTrashBodyKey("t-1")]: "{}",
      });

      const unavailable = createRecordingStorage({ failGetItem: true });
      expect(purgeExpiredTrash(unavailable.storage, NOW)).toEqual({
        status: "corrupt",
      });
      expect(unavailable.operations).toEqual([]);
    });

    it("期限切れも修復も無ければ書き込み・削除ゼロで表示順の entries を返す", () => {
      const older = makeTrashEntry({
        id: "t-1",
        deletedAt: "2026-11-01T00:00:00.000Z",
        expiresAt: "2026-12-01T00:00:00.000Z",
      });
      const newer = makeTrashEntry({
        id: "t-2",
        deletedAt: "2026-11-10T00:00:00.000Z",
        expiresAt: "2026-12-10T00:00:00.000Z",
      });
      const { storage, operations } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(
            makeTrashIndex([older, newer]),
          ),
        },
      });

      expect(purgeExpiredTrash(storage, NOW)).toEqual({
        status: "ok",
        entries: [newer, older],
      });
      expect(operations).toEqual([]);
    });

    it("期限切れ項目の本体（hasBody: true のみ）を削除し、残存項目があればインデックスを更新する", () => {
      const expiredWithBody = makeTrashEntry({
        id: "exp-1",
        expiresAt: "2026-11-15T00:00:00.000Z", // now と同じ時刻は期限切れ
        hasBody: true,
      });
      const expiredNoBody = makeTrashEntry({
        id: "exp-2",
        expiresAt: "2026-11-14T23:59:59.000Z",
        hasBody: false,
      });
      const active = makeTrashEntry({
        id: "act-1",
        expiresAt: "2026-11-15T00:00:01.000Z",
        hasBody: true,
      });
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(
            makeTrashIndex([expiredWithBody, expiredNoBody, active]),
          ),
          [mapTrashBodyKey("exp-1")]: '{"a":1}',
          [mapTrashBodyKey("act-1")]: '{"b":2}',
        },
      });

      expect(purgeExpiredTrash(storage, NOW)).toEqual({
        status: "ok",
        entries: [active],
      });
      expect(operations).toEqual([
        { type: "removeItem", key: mapTrashBodyKey("exp-1") },
        {
          type: "setItem",
          key: MAP_TRASH_INDEX_KEY,
          value: encodeMapTrashIndex(makeTrashIndex([active])),
        },
      ]);
      expect(entries()).toEqual({
        [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(makeTrashIndex([active])),
        [mapTrashBodyKey("act-1")]: '{"b":2}',
      });
    });

    it("全項目が期限切れで残存 0 件になった場合はゴミ箱インデックスキーを削除する", () => {
      const expired = makeTrashEntry({
        id: "exp-1",
        expiresAt: "2026-11-01T00:00:00.000Z",
        hasBody: true,
      });
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(makeTrashIndex([expired])),
          [mapTrashBodyKey("exp-1")]: "{}",
        },
      });

      expect(purgeExpiredTrash(storage, NOW)).toEqual({
        status: "ok",
        entries: [],
      });
      expect(operations).toEqual([
        { type: "removeItem", key: mapTrashBodyKey("exp-1") },
        { type: "removeItem", key: MAP_TRASH_INDEX_KEY },
      ]);
      expect(entries()).toEqual({});
    });

    it("期限切れ 0 件でも repaired: true の場合は修復後のインデックスを保存する", () => {
      const active = makeTrashEntry({ id: "act-1" });
      const { storage, operations } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: JSON.stringify({
            version: 1,
            items: [active, { broken: true }],
          }),
        },
      });

      expect(purgeExpiredTrash(storage, NOW)).toEqual({
        status: "ok",
        entries: [active],
      });
      expect(operations).toEqual([
        {
          type: "setItem",
          key: MAP_TRASH_INDEX_KEY,
          value: encodeMapTrashIndex(makeTrashIndex([active])),
        },
      ]);
    });

    it("expiresAt が壊れていても deletedAt が有効期間内なら本体を削除せず、再計算した期限でインデックスを書き戻す", () => {
      const brokenExpires = makeTrashEntry({
        id: "broken-exp",
        deletedAt: "2026-11-10T00:00:00.000Z",
        expiresAt: "not-a-date",
        hasBody: true,
      });
      const unknownDates = makeTrashEntry({
        id: "unknown-dates",
        deletedAt: "not-a-date",
        expiresAt: "not-a-date",
        hasBody: true,
      });
      const expectedBrokenRepaired = {
        ...brokenExpires,
        expiresAt: "2026-12-10T00:00:00.000Z",
      };
      const expectedUnknownRepaired = {
        ...unknownDates,
        deletedAt: "1970-01-01T00:00:00.000Z",
        expiresAt: "1970-01-01T00:00:00.000Z",
      };
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(
            makeTrashIndex([brokenExpires, unknownDates]),
          ),
          [mapTrashBodyKey("broken-exp")]: '{"a":1}',
          [mapTrashBodyKey("unknown-dates")]: '{"b":2}',
        },
      });

      expect(purgeExpiredTrash(storage, NOW)).toEqual({
        status: "ok",
        entries: [expectedBrokenRepaired, expectedUnknownRepaired],
      });
      expect(entries()).toEqual({
        [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(
          makeTrashIndex([expectedBrokenRepaired, expectedUnknownRepaired]),
        ),
        [mapTrashBodyKey("broken-exp")]: '{"a":1}',
        [mapTrashBodyKey("unknown-dates")]: '{"b":2}',
      });
    });

    it("repaired: true かつ修復後の残存項目が 0 件の場合はゴミ箱インデックスを削除する", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: JSON.stringify({
            version: 1,
            items: [{ broken: true }],
          }),
        },
      });

      expect(purgeExpiredTrash(storage, NOW)).toEqual({
        status: "ok",
        entries: [],
      });
      expect(operations).toEqual([
        { type: "removeItem", key: MAP_TRASH_INDEX_KEY },
      ]);
      expect(entries()).toEqual({});
    });

    it("期限切れ本体やインデックスの削除・更新が失敗しても例外を投げず active の状態を返す", () => {
      const expired = makeTrashEntry({
        id: "exp-1",
        expiresAt: "2026-11-01T00:00:00.000Z",
        hasBody: true,
      });
      const active = makeTrashEntry({ id: "act-1" });
      const failBodyAndSet = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(
            makeTrashIndex([expired, active]),
          ),
          [mapTrashBodyKey("exp-1")]: "{}",
        },
        failRemoveItem: () => true,
        failSetItem: () => true,
      });

      expect(purgeExpiredTrash(failBodyAndSet.storage, NOW)).toEqual({
        status: "ok",
        entries: [active],
      });

      const failAllRemoved = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex(makeTrashIndex([expired])),
          [mapTrashBodyKey("exp-1")]: "{}",
        },
        failRemoveItem: () => true,
      });

      expect(purgeExpiredTrash(failAllRemoved.storage, NOW)).toEqual({
        status: "ok",
        entries: [],
      });
    });
  });

  describe("forceClearCorruptTrash", () => {
    it("ゴミ箱本体キーをすべて削除してからインデックスを削除し、通常マップのキーは残す", () => {
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: '{"version":1}',
          [mapBodyKey("active-1")]: '{"nodes":[]}',
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: "{}",
          [mapTrashBodyKey("t-2")]: "{}",
          [mapTrashBodyKey("t-3")]: "{}",
        },
      });

      expect(forceClearCorruptTrash(storage)).toEqual({ ok: true });
      expect(entries()).toEqual({
        [MAP_INDEX_STORAGE_KEY]: '{"version":1}',
        [mapBodyKey("active-1")]: '{"nodes":[]}',
      });
    });

    it("本体キーの削除に一部失敗した場合はインデックスを残し、removedAny を正しく返す", () => {
      const partial = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: "{}",
          [mapTrashBodyKey("t-2")]: "{}",
        },
        failRemoveItem: (key) => key === mapTrashBodyKey("t-2"),
      });

      expect(forceClearCorruptTrash(partial.storage)).toEqual({
        ok: false,
        removedAny: true,
      });
      expect(partial.entries()).toEqual({
        [MAP_TRASH_INDEX_KEY]: "{broken",
        [mapTrashBodyKey("t-2")]: "{}",
      });

      const noneRemoved = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: "{}",
        },
        failRemoveItem: () => true,
      });

      expect(forceClearCorruptTrash(noneRemoved.storage)).toEqual({
        ok: false,
        removedAny: false,
      });
      expect(noneRemoved.entries()[MAP_TRASH_INDEX_KEY]).toBe("{broken");
    });

    it("本体全削除後にインデックス削除だけ失敗した場合は ok: false と removedAny を返す", () => {
      const withBodies = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: "{}",
        },
        failRemoveItem: (key) => key === MAP_TRASH_INDEX_KEY,
      });
      expect(forceClearCorruptTrash(withBodies.storage)).toEqual({
        ok: false,
        removedAny: true,
      });

      const withoutBodies = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
        },
        failRemoveItem: (key) => key === MAP_TRASH_INDEX_KEY,
      });
      expect(forceClearCorruptTrash(withoutBodies.storage)).toEqual({
        ok: false,
        removedAny: false,
      });
    });

    it("キー列挙中に例外が起きた場合はインデックスを残して removedAny: false で失敗する", () => {
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: "{}",
        },
      });
      const failingStorage = {
        get length() {
          return storage.length;
        },
        key() {
          throw new DOMException("blocked", "SecurityError");
        },
        getItem: (k: string) => storage.getItem(k),
        setItem: (k: string, v: string) => storage.setItem(k, v),
        removeItem: (k: string) => storage.removeItem(k),
      };

      expect(forceClearCorruptTrash(failingStorage)).toEqual({
        ok: false,
        removedAny: false,
      });
      expect(entries()[MAP_TRASH_INDEX_KEY]).toBe("{broken");
      expect(entries()[mapTrashBodyKey("t-1")]).toBe("{}");
    });
  });

  describe("collectTrashBodyKeys", () => {
    it("ゴミ箱本体キーだけを収集し、通常マップやインデックスのキーは含めない", () => {
      const { storage } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: '{"version":1}',
          [mapBodyKey("active-1")]: "{}",
          [MAP_TRASH_INDEX_KEY]: '{"version":1,"items":[]}',
          [mapTrashBodyKey("t-1")]: "{}",
          [mapTrashBodyKey("t-2")]: "{}",
        },
      });

      expect(collectTrashBodyKeys(storage)).toEqual([
        mapTrashBodyKey("t-1"),
        mapTrashBodyKey("t-2"),
      ]);
    });

    it("列挙中にストレージ例外が起きた場合は空配列に丸めず null を返す", () => {
      const { storage } = createRecordingStorage({
        initial: {
          [mapTrashBodyKey("t-1")]: "{}",
        },
      });
      const failingKeyStorage = {
        get length() {
          return storage.length;
        },
        key() {
          throw new DOMException("blocked", "SecurityError");
        },
        getItem: (k: string) => storage.getItem(k),
        setItem: (k: string, v: string) => storage.setItem(k, v),
        removeItem: (k: string) => storage.removeItem(k),
      };
      const failingLengthStorage = {
        get length(): number {
          throw new DOMException("blocked", "SecurityError");
        },
        key: (i: number) => storage.key(i),
        getItem: (k: string) => storage.getItem(k),
        setItem: (k: string, v: string) => storage.setItem(k, v),
        removeItem: (k: string) => storage.removeItem(k),
      };

      expect(collectTrashBodyKeys(failingKeyStorage)).toBeNull();
      expect(collectTrashBodyKeys(failingLengthStorage)).toBeNull();
    });
  });
});
