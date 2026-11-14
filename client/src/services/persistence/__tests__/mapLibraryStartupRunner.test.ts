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
  BRANCH_MOVE_JOURNAL_KEY,
  encodeBranchMoveJournal,
} from "../branchMoveJournal";
import { encodeLibraryRestoreJournal, LIBRARY_RESTORE_JOURNAL_KEY } from "../libraryRestoreJournal";
import {
  encodeMapTrashIndex,
  type MapTrashEntry,
} from "@/domain/mapLibrary/mapTrash";
import {
  MAP_INDEX_BACKUP_STORAGE_KEY,
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "../mapLibraryStorage";
import {
  MAP_TRASH_INDEX_KEY,
  mapTrashBodyKey,
} from "../mapTrashStorage";
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

  describe("中断した枝の移動の復旧", () => {
    const SOURCE_KEY = mapBodyKey("source");
    const index: MapIndexV1 = {
      version: 1,
      currentMapId: "source",
      maps: [
        createMapIndexEntry("source", "移動元", NOW),
        createMapIndexEntry("target", "移動先", NOW),
      ],
      legacyCleanupPending: false,
    };
    const originals = {
      [SOURCE_KEY]: "source original",
      [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
    };
    const journal = encodeBranchMoveJournal({
      version: 1,
      sourceId: "source",
      targetId: "target",
      sourceBefore: originals[SOURCE_KEY],
      targetBefore: null,
      indexBefore: originals[MAP_INDEX_STORAGE_KEY],
    });

    it("復旧した原本のインデックスから通常モードで開く", () => {
      const { storage, entries } = createRecordingStorage({
        initial: {
          ...originals,
          [BRANCH_MOVE_JOURNAL_KEY]: journal,
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex({ ...index, currentMapId: "target" }),
          [SOURCE_KEY]: "source after",
        },
      });

      expect(runMapLibraryStartup(storage, createDeps())).toMatchObject({
        mode: "persistent",
        index,
      });
      expect(entries()).toEqual(originals);
    });

    it("原本へ戻せなければ、移動元のマップの原本を保護モードで開く", () => {
      const { storage, entries } = createRecordingStorage({
        initial: { ...originals, [BRANCH_MOVE_JOURNAL_KEY]: journal },
        failRemoveItem: (key) => key === BRANCH_MOVE_JOURNAL_KEY,
      });

      const result = runMapLibraryStartup(storage, createDeps());

      expect(result).toMatchObject({
        mode: "protected",
        initialJson: originals[SOURCE_KEY],
        mapId: "source",
        mapName: "移動元",
        notice: { kind: "error" },
      });
      expect(result.notice?.message).toContain("JSON");
      expect(entries()[BRANCH_MOVE_JOURNAL_KEY]).toBe(journal);
    });

    it("壊れたジャーナルでは通常の初期化をせず、error の通知で固定の id の保護モードにする", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [BRANCH_MOVE_JOURNAL_KEY]: "{" },
      });

      const result = runMapLibraryStartup(storage, createDeps());

      expect(result).toMatchObject({
        mode: "protected",
        mapId: "branch-move-recovery",
        initialJson: null,
        notice: { kind: "error" },
      });
      expect(result.notice?.message).toContain(BRANCH_MOVE_JOURNAL_KEY);
      expect(result.notice?.message).not.toContain("書き出");
      expect(operations).toEqual([]);
    });

    it("保存領域を読めないときは、通常の起動と同じ warning の通知と生成した id の保護モードにする", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [BRANCH_MOVE_JOURNAL_KEY]: "{" },
        failGetItem: true,
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "protected",
        mapId: "map-a",
        mapName: "無題のマップ",
        initialJson: null,
        notice: { kind: "warning", message: UNAVAILABLE_WARNING },
      });
      expect(operations).toEqual([]);
    });

    it("ジャーナルのキーだけ読めなくても、原本へ戻す前の本体を通常どおりには開かない", () => {
      const { storage: base, operations } = createRecordingStorage({
        initial: { ...originals, [BRANCH_MOVE_JOURNAL_KEY]: journal, [SOURCE_KEY]: "source after" },
      });
      const storage: Storage = {
        ...base,
        getItem: (key) => {
          if (key === BRANCH_MOVE_JOURNAL_KEY) throw new DOMException("blocked", "SecurityError");
          return base.getItem(key);
        },
      };

      expect(runMapLibraryStartup(storage, createDeps())).toMatchObject({
        mode: "protected",
        initialJson: null,
        notice: { kind: "warning", message: UNAVAILABLE_WARNING },
      });
      expect(operations).toEqual([]);
    });

    it("storage が null なら復旧を試みず、通常の起動の判定に任せる", () => {
      const result = runMapLibraryStartup(null, createDeps());

      expect(result.mode).toBe("protected");
      expect(result.notice?.message).toBe(UNAVAILABLE_WARNING);
    });
  });

  describe("中断したライブラリ復元の復旧", () => {
    const originalIndex = createSingleMapIndex(createMapIndexEntry("source", "元", NOW), false);
    const before = encodeMapIndex(originalIndex);
    const after = encodeMapIndex({ ...originalIndex, maps: [...originalIndex.maps,
      createMapIndexEntry("added", "追加", NOW)] });
    const body = JSON.stringify({ version: 3, layoutMode: "manual", nodes: [] });
    const journal = encodeLibraryRestoreJournal({ format: "draw-my-map-library-restore", version: 1,
      indexBefore: before, indexAfter: after, bodies: [{ id: "added", json: body }] });

    it("通常の一覧読取より先に復旧し、旧一覧で開く", () => {
      const f = createRecordingStorage({ initial: { [MAP_INDEX_STORAGE_KEY]: after,
        [LIBRARY_RESTORE_JOURNAL_KEY]: journal, [mapBodyKey("added")]: body } });
      expect(runMapLibraryStartup(f.storage, createDeps())).toMatchObject({ mode: "persistent", index: originalIndex });
      expect(f.entries()).toEqual({ [MAP_INDEX_STORAGE_KEY]: before });
    });

    it("両 journal がある場合は枝移動の復旧も実行せず保護する", () => {
      const f = createRecordingStorage({ initial: { [MAP_INDEX_STORAGE_KEY]: after,
        [LIBRARY_RESTORE_JOURNAL_KEY]: journal, [BRANCH_MOVE_JOURNAL_KEY]: "{" } });
      const result = runMapLibraryStartup(f.storage, createDeps());
      expect(result.mode).toBe("protected");
      expect(result.notice?.message).toContain(LIBRARY_RESTORE_JOURNAL_KEY);
      expect(result.notice?.message).toContain(BRANCH_MOVE_JOURNAL_KEY);
      expect(f.operations).toEqual([]);
      expect(f.entries()[MAP_INDEX_STORAGE_KEY]).toBe(after);
    });

    it("復元 journal が壊れた場合、一覧修復を行わず保護する", () => {
      const f = createRecordingStorage({ initial: { [LIBRARY_RESTORE_JOURNAL_KEY]: "{" } });
      const result = runMapLibraryStartup(f.storage, createDeps());
      expect(result.mode).toBe("protected");
      expect(result.notice?.message).toContain(LIBRARY_RESTORE_JOURNAL_KEY);
      expect(f.operations).toEqual([]);
    });
  });

  describe("起動時のゴミ箱期限切れ清掃", () => {
    function makeTrashEntry(
      overrides: Partial<MapTrashEntry> & { id: string },
    ): MapTrashEntry {
      return {
        id: overrides.id,
        originalMapId: overrides.originalMapId ?? `orig-${overrides.id}`,
        name: overrides.name ?? `ゴミ箱 ${overrides.id}`,
        createdAt: overrides.createdAt ?? "2026-09-01T00:00:00.000Z",
        updatedAt: overrides.updatedAt ?? "2026-09-05T00:00:00.000Z",
        deletedAt: overrides.deletedAt ?? "2026-09-10T00:00:00.000Z",
        expiresAt: overrides.expiresAt ?? "2026-10-10T00:00:00.000Z",
        hasBody: overrides.hasBody ?? true,
      };
    }

    it("通常モード起動時に期限切れのゴミ箱エントリと本体を清掃する", () => {
      const index = untitledIndex("map-x", false);
      const expired = makeTrashEntry({
        id: "t-exp",
        expiresAt: NOW, // NOW と一致は期限切れ
        hasBody: true,
      });
      const active = makeTrashEntry({
        id: "t-act",
        deletedAt: "2026-10-15T00:00:00.000Z",
        expiresAt: "2026-11-14T00:00:00.000Z",
        hasBody: true,
      });
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({
            version: 1,
            items: [expired, active],
          }),
          [mapTrashBodyKey("t-exp")]: '{"expired":true}',
          [mapTrashBodyKey("t-act")]: '{"active":true}',
        },
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index,
        notice: null,
      });
      expect(entries()).toEqual({
        [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
        [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({
          version: 1,
          items: [active],
        }),
        [mapTrashBodyKey("t-act")]: '{"active":true}',
      });
    });

    it("期限切れがなければゴミ箱の書き込み・削除を行わない", () => {
      const index = untitledIndex("map-x", false);
      const active = makeTrashEntry({
        id: "t-act",
        expiresAt: "2026-11-14T00:00:00.000Z",
      });
      const { storage, operations } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({
            version: 1,
            items: [active],
          }),
          [mapTrashBodyKey("t-act")]: '{"active":true}',
        },
      });

      expect(runMapLibraryStartup(storage, createDeps()).mode).toBe("persistent");
      expect(operations).toEqual([]);
    });

    it("ゴミ箱インデックスが破損していても通常モード起動を成功させ、破損データを削除しない", () => {
      const index = untitledIndex("map-x", false);
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: "{}",
        },
      });

      expect(runMapLibraryStartup(storage, createDeps())).toEqual({
        mode: "persistent",
        index,
        notice: null,
      });
      expect(operations).toEqual([]);
      expect(entries()[MAP_TRASH_INDEX_KEY]).toBe("{broken");
      expect(entries()[mapTrashBodyKey("t-1")]).toBe("{}");
    });

    it("保護モード結果になった場合はゴミ箱清掃を実行しない", () => {
      const expired = makeTrashEntry({
        id: "t-exp",
        expiresAt: "2026-10-01T00:00:00.000Z",
        hasBody: true,
      });
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [BRANCH_MOVE_JOURNAL_KEY]: "{",
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({
            version: 1,
            items: [expired],
          }),
          [mapTrashBodyKey("t-exp")]: '{"expired":true}',
        },
      });

      expect(runMapLibraryStartup(storage, createDeps()).mode).toBe("protected");
      expect(operations).toEqual([]);
      expect(entries()[mapTrashBodyKey("t-exp")]).toBe('{"expired":true}');
    });
  });
});
