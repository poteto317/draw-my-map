import {
  createMapIndexEntry,
  createSingleMapIndex,
  encodeMapIndex,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import type { MapLibraryStartupDeps } from "@/domain/mapLibrary/mapLibraryStartup";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";
import {
  parseMapDocumentJsonWithVersion,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  MAP_INDEX_BACKUP_STORAGE_KEY,
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "../mapLibraryStorage";
import { runMapLibraryStartup } from "../mapLibraryStartupRunner";
import { MAP_STORAGE_KEY } from "../mapStorage";

const NOW = "2026-10-21T03:04:05.000Z";

const UNAVAILABLE_WARNING =
  "ブラウザの保存領域を使えないため、このマップは保存されません。必要な場合はJSONで書き出してください。";
const INITIALIZE_FAILURE =
  "ブラウザに保存できないため、このマップは保存されません。必要な場合はJSONで書き出してください。";
const MIGRATE_FAILURE =
  "以前の保存データを新しい形式へ移行できませんでした。この画面での変更は保存されません。必要な場合はJSONで書き出してください。";
const MIGRATE_LEGACY_LOST_FAILURE =
  "以前の保存データを新しい形式へ移行できず、ブラウザにも残せませんでした。この画面での変更は保存されません。ページを閉じる前に、JSONで書き出してください。";
const LEGACY_CORRUPT_WARNING =
  "以前の保存データを読み込めなかったため、空のマップで開始します。以前の保存データは消さずに残しています。";
const LEGACY_CORRUPT_FAILURE =
  "以前の保存データを読み込めず、ブラウザにも保存できないため、このマップは保存されません。以前の保存データは消さずに残しています。";
const REBUILD_WARNING =
  "マップの一覧を読み取れなかったため、保存済みのマップから一覧を作り直しました。マップ名は「復元したマップ」になっています。";
const REBUILD_FAILURE =
  "マップの一覧を読み取れませんでした。保存データを守るため、この画面での変更は保存されません。";

// 起動ごとに "map-a"、"map-b"… を順に返す。
function createDeps(): MapLibraryStartupDeps {
  let count = 0;
  return {
    now: () => new Date(NOW),
    generateId: () => {
      const id = `map-${String.fromCharCode(97 + count)}`;
      count += 1;
      return id;
    },
  };
}

function untitledIndex(id: string, legacyCleanupPending: boolean): MapIndexV1 {
  return createSingleMapIndex(
    createMapIndexEntry(id, DEFAULT_MAP_NAME, NOW),
    legacyCleanupPending,
  );
}

const legacyV3Raw = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    createTestNode({ id: 7, parentId: null, x: 120, y: -40, label: "中心" }),
    createTestNode({ id: 12, parentId: 7, x: 360, y: 80, label: "子" }),
  ],
});

const legacyV1Raw = JSON.stringify({
  version: 1,
  layoutMode: "auto",
  nodes: [
    { id: 3, parentId: null, x: 10, y: 20, width: 160, height: 64, label: "旧形式" },
  ],
});

function migratedBodyJson(raw: string): string {
  const parsed = parseMapDocumentJsonWithVersion(raw);
  if (!parsed.ok) {
    throw new Error("テストの旧キーを読めません。");
  }
  return serializeMapDocument(parsed.value.document);
}

describe("runMapLibraryStartup", () => {
  it("storage が null なら書かずに保護モードで開き、warning を出す", () => {
    expect(runMapLibraryStartup(null, createDeps())).toEqual({
      mode: "protected",
      mapId: "map-a",
      mapName: DEFAULT_MAP_NAME,
      initialJson: null,
      notice: { kind: "warning", message: UNAVAILABLE_WARNING },
    });
  });

  it("正常なインデックス（P: false）は書かずに開く", () => {
    const index = untitledIndex("map-x", false);
    const { storage, operations } = createRecordingStorage({
      initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index) },
    });

    expect(runMapLibraryStartup(storage, createDeps())).toEqual({
      mode: "persistent",
      index,
      notice: null,
    });
    expect(operations).toEqual([]);
  });

  describe("初回起動", () => {
    it("インデックスを書いて開き、通知は出さない", () => {
      const { storage, operations } = createRecordingStorage();
      const expectedIndex = untitledIndex("map-a", false);

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: expectedIndex,
        notice: null,
      });
      expect(operations).toEqual([
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(expectedIndex),
        },
      ]);
    });

    it("インデックスの書き込みに失敗したら保護モードで開く", () => {
      const { storage, entries } = createRecordingStorage({
        failSetItem: () => true,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: null,
        notice: { kind: "error", message: INITIALIZE_FAILURE },
      });
      expect(entries()).toEqual({});
    });
  });

  describe("旧キーの移行", () => {
    it("本体 → インデックスの順に書き、旧キーはこの起動では残す。次の起動で旧キーを消して P: false を書く", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: legacyV3Raw },
      });
      const bodyJson = migratedBodyJson(legacyV3Raw);
      const migratedIndex = untitledIndex("map-a", true);

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: migratedIndex,
        notice: null,
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("map-a"), value: bodyJson },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(migratedIndex),
        },
      ]);
      expect(entries()).toEqual({
        [MAP_STORAGE_KEY]: legacyV3Raw,
        [mapBodyKey("map-a")]: bodyJson,
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(migratedIndex),
      });

      // 2回目の起動
      operations.length = 0;
      const cleanedIndex = untitledIndex("map-a", false);

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: cleanedIndex,
        notice: null,
      });
      expect(operations).toEqual([
        { type: "removeItem", key: MAP_STORAGE_KEY },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(cleanedIndex),
        },
      ]);
      expect(entries()).toEqual({
        [mapBodyKey("map-a")]: bodyJson,
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(cleanedIndex),
      });
    });

    it("V1 の旧キーも V3 で本体に書き、旧キーは元の V1 の文字列のまま残す", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: legacyV1Raw },
      });

      expect(runMapLibraryStartup(storage, createDeps()).mode).toBe(
        "persistent",
      );
      expect(JSON.parse(entries()[mapBodyKey("map-a")]).version).toBe(3);
      expect(entries()[MAP_STORAGE_KEY]).toBe(legacyV1Raw);
      expect(operations.some((op) => op.key === MAP_STORAGE_KEY)).toBe(false);
    });

    it("QuotaExceededError 以外で本体の書き込みに失敗したら、やり直さず、インデックスを書かずに旧キーの生の文字列を保護モードで開く", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: legacyV3Raw },
        failSetItem: (key) => key === mapBodyKey("map-a"),
        failSetItemError: "SecurityError",
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: legacyV3Raw,
        notice: { kind: "error", message: MIGRATE_FAILURE },
      });
      expect(operations.map((op) => op.key)).toEqual([mapBodyKey("map-a")]);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: legacyV3Raw });
    });

    it("QuotaExceededError 以外でインデックスの書き込みに失敗したら、本体を removeItem で戻し、旧キーの生の文字列を保護モードで開く", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: legacyV3Raw },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        failSetItemError: "SecurityError",
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: legacyV3Raw,
        notice: { kind: "error", message: MIGRATE_FAILURE },
      });
      expect(operations).toEqual([
        {
          type: "setItem",
          key: mapBodyKey("map-a"),
          value: migratedBodyJson(legacyV3Raw),
        },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(untitledIndex("map-a", true)),
        },
        { type: "removeItem", key: mapBodyKey("map-a") },
      ]);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: legacyV3Raw });
    });

    it("本体を戻す操作も失敗したら、本体は孤立した本体として残り、同じ保護モードで開く", () => {
      const { storage, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: legacyV3Raw },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        failRemoveItem: (key) => key === mapBodyKey("map-a"),
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: legacyV3Raw,
        notice: { kind: "error", message: MIGRATE_FAILURE },
      });
      expect(entries()).toEqual({
        [MAP_STORAGE_KEY]: legacyV3Raw,
        [mapBodyKey("map-a")]: migratedBodyJson(legacyV3Raw),
      });
    });
  });

  describe("旧キーが容量の約半分を超えている移行", () => {
    const largeLegacyRaw = JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        createTestNode({ id: 1, parentId: null, x: 0, y: 0, label: "大".repeat(3000) }),
      ],
    });
    const largeBodyJson = migratedBodyJson(largeLegacyRaw);
    const size = (key: string, value: string) => key.length + value.length;
    const legacySize = size(MAP_STORAGE_KEY, largeLegacyRaw);
    const bodySize = size(mapBodyKey("map-a"), largeBodyJson);
    const retryIndex = untitledIndex("map-a", false);
    const retryIndexSize = size(MAP_INDEX_STORAGE_KEY, encodeMapIndex(retryIndex));

    it("旧キーを消してから本体・P: false のインデックスを書き、通常のモードで開く。次の起動は何も書かずに開く", () => {
      const capacity = bodySize + retryIndexSize + 10;
      expect(legacySize + bodySize).toBeGreaterThan(capacity);
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: largeLegacyRaw },
        capacity,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: retryIndex,
        notice: null,
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        { type: "removeItem", key: MAP_STORAGE_KEY },
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(retryIndex),
        },
      ]);
      expect(entries()).toEqual({
        [mapBodyKey("map-a")]: largeBodyJson,
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(retryIndex),
      });

      // 2回目の起動
      operations.length = 0;

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: retryIndex,
        notice: null,
      });
      expect(operations).toEqual([]);
    });

    it("本体は入るがインデックスが容量不足なら、本体を消して旧キーを消してからやり直し、通常のモードで開く", () => {
      const capacity = legacySize + bodySize + 5;
      expect(bodySize + retryIndexSize).toBeLessThanOrEqual(capacity);
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: largeLegacyRaw },
        capacity,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: retryIndex,
        notice: null,
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(untitledIndex("map-a", true)),
        },
        { type: "removeItem", key: mapBodyKey("map-a") },
        { type: "removeItem", key: MAP_STORAGE_KEY },
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(retryIndex),
        },
      ]);
      expect(entries()).toEqual({
        [mapBodyKey("map-a")]: largeBodyJson,
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(retryIndex),
      });
    });

    it("やり直しの本体の書き込みにも失敗したら、旧キーを書き戻し、旧キーの生の文字列を保護モードで開く", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: largeLegacyRaw },
        failSetItem: (key) => key === mapBodyKey("map-a"),
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: largeLegacyRaw,
        notice: { kind: "error", message: MIGRATE_FAILURE },
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        { type: "removeItem", key: MAP_STORAGE_KEY },
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        { type: "setItem", key: MAP_STORAGE_KEY, value: largeLegacyRaw },
      ]);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: largeLegacyRaw });
    });

    it("やり直しのインデックスの書き込みに失敗したら、本体を消して旧キーを書き戻し、保護モードで開く", () => {
      const capacity = bodySize + 5;
      expect(legacySize).toBeLessThanOrEqual(capacity);
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: largeLegacyRaw },
        capacity,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: largeLegacyRaw,
        notice: { kind: "error", message: MIGRATE_FAILURE },
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        { type: "removeItem", key: MAP_STORAGE_KEY },
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(retryIndex),
        },
        { type: "removeItem", key: mapBodyKey("map-a") },
        { type: "setItem", key: MAP_STORAGE_KEY, value: largeLegacyRaw },
      ]);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: largeLegacyRaw });
    });

    it("やり直しで旧キーを消せなかったら、何も書かずに旧キーを残し、旧キーの生の文字列を保護モードで開く", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: largeLegacyRaw },
        failSetItem: (key) => key === mapBodyKey("map-a"),
        failRemoveItem: (key) => key === MAP_STORAGE_KEY,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: largeLegacyRaw,
        notice: { kind: "error", message: MIGRATE_FAILURE },
      });
      expect(operations).toEqual([
        { type: "setItem", key: mapBodyKey("map-a"), value: largeBodyJson },
        { type: "removeItem", key: MAP_STORAGE_KEY },
      ]);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: largeLegacyRaw });
    });

    it("書き戻しにも失敗したら、旧キーの生の文字列を保護モードで開き、JSON での書き出しを案内する", () => {
      const { storage, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: largeLegacyRaw },
        failSetItem: (key) =>
          key === mapBodyKey("map-a") || key === MAP_STORAGE_KEY,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: largeLegacyRaw,
        notice: { kind: "error", message: MIGRATE_LEGACY_LOST_FAILURE },
      });
      expect(entries()).toEqual({});
    });
  });

  describe("旧キーの後始末", () => {
    const pendingIndex = untitledIndex("map-x", true);

    it("旧キーの削除に失敗したら、インデックスを書かず P: true のまま開く", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(pendingIndex),
          [MAP_STORAGE_KEY]: legacyV3Raw,
        },
        failRemoveItem: (key) => key === MAP_STORAGE_KEY,
      });

      const result = runMapLibraryStartup(storage, createDeps());

      expect(result).toEqual({
        mode: "persistent",
        index: pendingIndex,
        notice: null,
      });
      expect(result.mode === "persistent" && result.index.legacyCleanupPending).toBe(
        true,
      );
      expect(operations).toEqual([{ type: "removeItem", key: MAP_STORAGE_KEY }]);
      expect(entries()).toEqual({
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(pendingIndex),
        [MAP_STORAGE_KEY]: legacyV3Raw,
      });
    });

    it("旧キーは消せたがインデックスの書き込みに失敗したら、元のインデックスで開く", () => {
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(pendingIndex),
          [MAP_STORAGE_KEY]: legacyV3Raw,
        },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: pendingIndex,
        notice: null,
      });
      expect(entries()).toEqual({
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(pendingIndex),
      });
    });
  });

  describe("旧キーが壊れている", () => {
    it("インデックスを書けたら warning で開き、旧キーには触れない", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: "{" },
      });
      const expectedIndex = untitledIndex("map-a", false);

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: expectedIndex,
        notice: { kind: "warning", message: LEGACY_CORRUPT_WARNING },
      });
      expect(operations).toEqual([
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(expectedIndex),
        },
      ]);
      expect(entries()[MAP_STORAGE_KEY]).toBe("{");
    });

    it("インデックスを書けなかったら保護モードで開き、旧キーには触れない", () => {
      const { storage, operations, entries } = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: "{" },
        failSetItem: () => true,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-b",
        mapName: DEFAULT_MAP_NAME,
        initialJson: null,
        notice: { kind: "error", message: LEGACY_CORRUPT_FAILURE },
      });
      expect(operations.some((op) => op.key === MAP_STORAGE_KEY)).toBe(false);
      expect(entries()).toEqual({ [MAP_STORAGE_KEY]: "{" });
    });
  });

  describe("インデックスの破損", () => {
    const corruptRaw = "not-json";
    const bodyJson = migratedBodyJson(legacyV3Raw);

    function corruptStorage(
      fail: Parameters<typeof createRecordingStorage>[0] = {},
    ) {
      return createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: corruptRaw,
          [mapBodyKey("map-x")]: bodyJson,
        },
        ...fail,
      });
    }

    it("退避 → インデックスの順に書き、warning で開く", () => {
      const { storage, operations } = corruptStorage();
      const expectedIndex: MapIndexV1 = {
        version: 1,
        currentMapId: "map-x",
        maps: [createMapIndexEntry("map-x", "復元したマップ 1", NOW)],
        legacyCleanupPending: false,
      };

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index: expectedIndex,
        notice: { kind: "warning", message: REBUILD_WARNING },
      });
      expect(operations).toEqual([
        { type: "setItem", key: MAP_INDEX_BACKUP_STORAGE_KEY, value: corruptRaw },
        {
          type: "setItem",
          key: MAP_INDEX_STORAGE_KEY,
          value: encodeMapIndex(expectedIndex),
        },
      ]);
    });

    it("退避に失敗したらインデックスを書かず、壊れたインデックスを残して保護モードで開く", () => {
      const { storage, operations, entries } = corruptStorage({
        failSetItem: (key) => key === MAP_INDEX_BACKUP_STORAGE_KEY,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-a",
        mapName: DEFAULT_MAP_NAME,
        initialJson: null,
        notice: { kind: "error", message: REBUILD_FAILURE },
      });
      expect(operations.map((op) => op.key)).toEqual([
        MAP_INDEX_BACKUP_STORAGE_KEY,
      ]);
      expect(entries()[MAP_INDEX_STORAGE_KEY]).toBe(corruptRaw);
    });

    it("インデックスの書き込みに失敗したら、壊れたインデックスを残して保護モードで開く", () => {
      const { storage, entries } = corruptStorage({
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-a",
        mapName: DEFAULT_MAP_NAME,
        initialJson: null,
        notice: { kind: "error", message: REBUILD_FAILURE },
      });
      expect(entries()).toEqual({
        [MAP_INDEX_STORAGE_KEY]: corruptRaw,
        [mapBodyKey("map-x")]: bodyJson,
        [MAP_INDEX_BACKUP_STORAGE_KEY]: corruptRaw,
      });
    });
  });
});
