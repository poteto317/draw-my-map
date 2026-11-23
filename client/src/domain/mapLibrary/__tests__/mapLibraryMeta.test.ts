import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  MAP_FOLDER_ID_PATTERN,
  MAX_MAP_FOLDERS,
  MAX_MAP_FOLDER_NAME_INPUT_LENGTH,
  MAX_MAP_FOLDER_NAME_LENGTH,
  MAX_RECENT_MAPS,
  assignMapFolder,
  countMapsByFolder,
  createEmptyMapLibraryMeta,
  createMapFolder,
  decodeMapLibraryMeta,
  deleteMapFolder,
  encodeMapLibraryMeta,
  filterAndSortMapsForList,
  formatMapFolderFailure,
  mapFolderNameKey,
  mergeLibraryMetaForRestore,
  normalizeMapFolderName,
  pruneMapMetaForRemovedMap,
  recordMapOpened,
  renameMapFolder,
  archiveMapMeta,
  toggleMapFavorite,
  unarchiveMapMeta,
  validateBackupLibraryMeta,
  isMapArchived,
  type MapFolder,
  type MapFolderFailureReason,
  type MapLibraryMetaV1,
  type MapUserMeta,
} from "@/domain/mapLibrary/mapLibraryMeta";

const T1 = "2026-11-01T00:00:00.000Z";
const T2 = "2026-11-02T00:00:00.000Z";
const T3 = "2026-11-03T00:00:00.000Z";

function makeFolder(
  id: string,
  name: string,
  createdAt = T1,
  updatedAt = createdAt,
): MapFolder {
  return { id, name, createdAt, updatedAt };
}

function makeFolders(count: number, prefix = "folder"): MapFolder[] {
  return Array.from({ length: count }, (_, i) =>
    makeFolder(`${prefix}-${i + 1}`, `フォルダー ${i + 1}`),
  );
}

function makeMapEntry(
  overrides: Partial<MapIndexEntry> & { id: string },
): MapIndexEntry {
  return {
    id: overrides.id,
    name: overrides.name ?? `マップ ${overrides.id}`,
    createdAt: overrides.createdAt ?? T1,
    updatedAt: overrides.updatedAt ?? T1,
  };
}

describe("定数と createEmptyMapLibraryMeta", () => {
  it("設計どおりの定数値を持つ", () => {
    expect(MAX_MAP_FOLDERS).toBe(50);
    expect(MAX_MAP_FOLDER_NAME_LENGTH).toBe(50);
    expect(MAX_MAP_FOLDER_NAME_INPUT_LENGTH).toBe(256);
    expect(MAX_RECENT_MAPS).toBe(20);
    expect(MAP_FOLDER_ID_PATTERN.test("folder_1-A")).toBe(true);
    expect(MAP_FOLDER_ID_PATTERN.test("")).toBe(false);
    expect(MAP_FOLDER_ID_PATTERN.test("a".repeat(65))).toBe(false);
    expect(MAP_FOLDER_ID_PATTERN.test("bad id")).toBe(false);
  });

  it("createEmptyMapLibraryMeta は毎回新しいオブジェクト参照を返す（L-461）", () => {
    const a = createEmptyMapLibraryMeta();
    const b = createEmptyMapLibraryMeta();

    expect(a).toEqual({ version: 1, folders: [], mapMeta: {} });
    expect(a).not.toBe(b);
    expect(a.folders).not.toBe(b.folders);
    expect(a.mapMeta).not.toBe(b.mapMeta);
  });
});

describe("normalizeMapFolderName / mapFolderNameKey", () => {
  it("前後空白を削り、連続空白（タブ・改行・全角空白・NBSP）を半角スペース 1 個へまとめる", () => {
    expect(normalizeMapFolderName("  仕事\t\n\u3000\u00a0プロジェクト  ")).toEqual({
      ok: true,
      name: "仕事 プロジェクト",
    });
  });

  it("大文字小文字や全角半角の表記は保存名としてそのまま残す", () => {
    expect(normalizeMapFolderName("ＡＩ Research")).toEqual({
      ok: true,
      name: "ＡＩ Research",
    });
  });

  it("空文字・空白のみは empty で拒否する", () => {
    expect(normalizeMapFolderName("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizeMapFolderName("  \t\n\u3000 ")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("正規化前の先行長 256 を超える入力は too-long で拒否する（L-443）", () => {
    const tooLongWithSpaces = `a${" ".repeat(255)}b`;
    expect(tooLongWithSpaces.trim().length).toBe(257);
    expect(normalizeMapFolderName(tooLongWithSpaces)).toEqual({
      ok: false,
      reason: "too-long",
    });

    const withinInputLimit = `a${" ".repeat(254)}b`;
    expect(withinInputLimit.trim().length).toBe(256);
    expect(normalizeMapFolderName(withinInputLimit)).toEqual({
      ok: true,
      name: "a b",
    });
  });

  it("コードポイント数 50 上限を判定する（サロゲートペア 50 個は許可・51 個は too-long、L-836）", () => {
    const fiftyEmoji = "😀".repeat(50);
    expect(fiftyEmoji.length).toBe(100);
    expect(normalizeMapFolderName(fiftyEmoji)).toEqual({
      ok: true,
      name: fiftyEmoji,
    });

    const fiftyOneEmoji = "😀".repeat(51);
    expect(normalizeMapFolderName(fiftyOneEmoji)).toEqual({
      ok: false,
      reason: "too-long",
    });

    expect(normalizeMapFolderName("あ".repeat(50))).toEqual({
      ok: true,
      name: "あ".repeat(50),
    });
    expect(normalizeMapFolderName("あ".repeat(51))).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it.each<[string, string]>([
    ["NUL 制御文字", "仕事\u0000"],
    ["C0 制御文字", "仕事\u001f"],
    ["DEL 制御文字", "仕事\u007f"],
    ["C1 制御文字", "仕事\u0085"],
    ["ゼロ幅スペース U+200B", "仕事\u200b"],
    ["双方向制御 U+202E", "仕事\u202e"],
    ["ソフトハイフン U+00AD", "仕事\u00ad"],
    ["行内注釈 U+FFF9", "仕事\ufff9"],
    ["タグ文字 U+E0001", "仕事\u{E0001}"],
  ])("%s を含む名前は invalid で拒否する", (_label, input) => {
    expect(normalizeMapFolderName(input)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("U+200D・U+FE0E・U+FE0F は例外許可し、重複判定鍵からは除去する", () => {
    const family = "👨‍👩‍👧";
    expect(normalizeMapFolderName(family)).toEqual({ ok: true, name: family });
    expect(normalizeMapFolderName("❤\ufe0f 仕事")).toEqual({
      ok: true,
      name: "❤\ufe0f 仕事",
    });
    expect(normalizeMapFolderName("❤\ufe0e 仕事")).toEqual({
      ok: true,
      name: "❤\ufe0e 仕事",
    });

    expect(mapFolderNameKey("AI")).toBe(mapFolderNameKey("A\u200dI"));
    expect(mapFolderNameKey("❤")).toBe(mapFolderNameKey("❤\ufe0f"));
    expect(mapFolderNameKey("❤\ufe0e")).toBe(mapFolderNameKey("❤\ufe0f"));
    expect(mapFolderNameKey("ＡＩ  仕事")).toBe(mapFolderNameKey("ai 仕事"));
    expect(mapFolderNameKey("AI \u200d")).toBe(mapFolderNameKey("ai"));
  });

  it("許可された不可視書式文字と空白だけで鍵が空になる場合は invalid で拒否する", () => {
    expect(normalizeMapFolderName("\u200d")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(normalizeMapFolderName("\ufe0f \u200d \ufe0e")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("formatMapFolderFailure", () => {
  it.each<MapFolderFailureReason>([
    "empty",
    "too-long",
    "invalid",
    "duplicate",
    "too-many",
    "folder-missing",
    "invalid-id",
  ])("理由 %s に対して空でない日本語メッセージを返す", (reason) => {
    const message = formatMapFolderFailure(reason);
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("decodeMapLibraryMeta / encodeMapLibraryMeta", () => {
  it("null は空のメタデータを repaired: false で返す", () => {
    const a = decodeMapLibraryMeta(null);
    const b = decodeMapLibraryMeta(null);

    expect(a).toEqual({
      ok: true,
      meta: { version: 1, folders: [], mapMeta: {} },
      repaired: false,
    });
    if (a.ok && b.ok) {
      expect(a.meta).not.toBe(b.meta);
    }
  });

  it("正常データを往復デコードできる", () => {
    const meta: MapLibraryMetaV1 = {
      version: 1,
      folders: [makeFolder("f-1", "仕事", T1, T2)],
      mapMeta: {
        "map-1": { favorite: true, lastOpenedAt: T2, folderId: "f-1" },
        "map-2": { lastOpenedAt: T1 },
      },
    };

    const encoded = encodeMapLibraryMeta(meta);
    expect(decodeMapLibraryMeta(encoded)).toEqual({
      ok: true,
      meta,
      repaired: false,
    });
  });

  it.each<[string, string]>([
    ["不正 JSON", "{not-json"],
    ["配列ルート", "[]"],
    ["version 不一致", JSON.stringify({ version: 2, folders: [], mapMeta: {} })],
    [
      "トップレベル未知キー",
      JSON.stringify({ version: 1, folders: [], mapMeta: {}, extra: 1 }),
    ],
    [
      "folders が配列でない",
      JSON.stringify({ version: 1, folders: {}, mapMeta: {} }),
    ],
    [
      "mapMeta がプレーンオブジェクトでない",
      JSON.stringify({ version: 1, folders: [], mapMeta: [] }),
    ],
    [
      "folders 上限 50 超過",
      JSON.stringify({
        version: 1,
        folders: makeFolders(MAX_MAP_FOLDERS + 1),
        mapMeta: {},
      }),
    ],
    [
      "folder 要素に未知キー",
      JSON.stringify({
        version: 1,
        folders: [{ ...makeFolder("f-1", "仕事"), extra: true }],
        mapMeta: {},
      }),
    ],
    [
      "folder の id が不正",
      JSON.stringify({
        version: 1,
        folders: [makeFolder("bad id", "仕事")],
        mapMeta: {},
      }),
    ],
    [
      "folder の name が未正規化（前後空白）",
      JSON.stringify({
        version: 1,
        folders: [makeFolder("f-1", " 仕事 ")],
        mapMeta: {},
      }),
    ],
    [
      "folder の name が未正規化（連続空白）",
      JSON.stringify({
        version: 1,
        folders: [makeFolder("f-1", "仕事  メモ")],
        mapMeta: {},
      }),
    ],
    [
      "folder の id が重複",
      JSON.stringify({
        version: 1,
        folders: [makeFolder("f-1", "仕事"), makeFolder("f-1", "趣味")],
        mapMeta: {},
      }),
    ],
    [
      "folder の名前鍵が重複（NFKC/小文字化一致）",
      JSON.stringify({
        version: 1,
        folders: [makeFolder("f-1", "Work"), makeFolder("f-2", "ｗｏｒｋ")],
        mapMeta: {},
      }),
    ],
    [
      "folder の createdAt が厳密 ISO 8601 でない",
      JSON.stringify({
        version: 1,
        folders: [makeFolder("f-1", "仕事", "2026-11-01T00:00:00Z", T1)],
        mapMeta: {},
      }),
    ],
    [
      "folder の updatedAt が不正日時",
      JSON.stringify({
        version: 1,
        folders: [makeFolder("f-1", "仕事", T1, "not-a-date")],
        mapMeta: {},
      }),
    ],
    [
      "mapMeta のキーが不正な mapId",
      JSON.stringify({
        version: 1,
        folders: [],
        mapMeta: { "bad id": { favorite: true } },
      }),
    ],
    [
      "mapMeta の値がプレーンオブジェクトでない",
      JSON.stringify({
        version: 1,
        folders: [],
        mapMeta: { "map-1": null },
      }),
    ],
    [
      "mapMeta 要素に未知キー",
      JSON.stringify({
        version: 1,
        folders: [],
        mapMeta: { "map-1": { favorite: true, extra: 1 } },
      }),
    ],
    [
      "mapMeta の favorite が boolean でない",
      JSON.stringify({
        version: 1,
        folders: [],
        mapMeta: { "map-1": { favorite: "yes" } },
      }),
    ],
    [
      "mapMeta の lastOpenedAt が厳密 ISO でない",
      JSON.stringify({
        version: 1,
        folders: [],
        mapMeta: { "map-1": { lastOpenedAt: "2026-11-01" } },
      }),
    ],
    [
      "mapMeta の archivedAt が厳密 ISO でない",
      JSON.stringify({
        version: 1,
        folders: [],
        mapMeta: { "map-1": { archivedAt: "2026-11-01" } },
      }),
    ],
    [
      "mapMeta の folderId がパターン違反",
      JSON.stringify({
        version: 1,
        folders: [],
        mapMeta: { "map-1": { folderId: "bad id" } },
      }),
    ],
  ])("%s は corrupt を返す", (_label, raw) => {
    expect(decodeMapLibraryMeta(raw)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("孤立 folderId・favorite: false・全項目空エントリを安全修復し repaired: true を返す", () => {
    const raw = JSON.stringify({
      version: 1,
      folders: [makeFolder("f-1", "仕事")],
      mapMeta: {
        "map-1": { favorite: true, folderId: "missing-folder" },
        "map-2": { favorite: false, lastOpenedAt: T1 },
        "map-3": { favorite: false, folderId: "missing-folder" },
        "map-4": {},
      },
    });

    const decoded = decodeMapLibraryMeta(raw);
    expect(decoded).toEqual({
      ok: true,
      repaired: true,
      meta: {
        version: 1,
        folders: [makeFolder("f-1", "仕事")],
        mapMeta: {
          "map-1": { favorite: true },
          "map-2": { lastOpenedAt: T1 },
        },
      },
    });
    if (decoded.ok) {
      expect("folderId" in decoded.meta.mapMeta["map-1"]).toBe(false);
      expect("favorite" in decoded.meta.mapMeta["map-2"]).toBe(false);
      expect("map-3" in decoded.meta.mapMeta).toBe(false);
      expect("map-4" in decoded.meta.mapMeta).toBe(false);
    }
  });
});

describe("メタデータ操作の純粋関数", () => {
  const baseMeta: MapLibraryMetaV1 = {
    version: 1,
    folders: [makeFolder("f-1", "仕事", T1, T1), makeFolder("f-2", "趣味", T1, T1)],
    mapMeta: {
      "map-1": { favorite: true, lastOpenedAt: T1, folderId: "f-1" },
      "map-2": { favorite: true },
    },
  };

  describe("archiveMapMeta / unarchiveMapMeta", () => {
    it("アーカイブ日時を付与・解除し、他フィールドを保持する", () => {
      const archived = archiveMapMeta(baseMeta, "map-1", T3);
      expect(archived.mapMeta["map-1"]).toEqual({
        favorite: true,
        lastOpenedAt: T1,
        folderId: "f-1",
        archivedAt: T3,
      });
      expect(isMapArchived(archived.mapMeta["map-1"])).toBe(true);

      const restored = unarchiveMapMeta(archived, "map-1");
      expect(restored.mapMeta["map-1"]).toEqual({
        favorite: true,
        lastOpenedAt: T1,
        folderId: "f-1",
      });
      expect("archivedAt" in restored.mapMeta["map-1"]).toBe(false);
    });
  });

  describe("toggleMapFavorite", () => {
    it("アーカイブ済みでもお気に入りを切り替えて archivedAt を保持する", () => {
      const archived = archiveMapMeta(baseMeta, "map-1", T2);
      const toggled = toggleMapFavorite(archived, "map-1");
      expect(toggled.mapMeta["map-1"]?.archivedAt).toBe(T2);
      expect("favorite" in (toggled.mapMeta["map-1"] ?? {})).toBe(false);
    });

    it("お気に入りを切り替えても他の既存フィールドを消去しない（L-454）", () => {
      const off = toggleMapFavorite(baseMeta, "map-1");
      expect(off.mapMeta["map-1"]).toEqual({ lastOpenedAt: T1, folderId: "f-1" });
      expect("favorite" in off.mapMeta["map-1"]).toBe(false);

      const onAgain = toggleMapFavorite(off, "map-1");
      expect(onAgain.mapMeta["map-1"]).toEqual({
        favorite: true,
        lastOpenedAt: T1,
        folderId: "f-1",
      });
      // 元のオブジェクトを破壊しない
      expect(baseMeta.mapMeta["map-1"]).toEqual({
        favorite: true,
        lastOpenedAt: T1,
        folderId: "f-1",
      });
    });

    it("favorite のみ持つエントリをオフにすると mapMeta からエントリごと削除する", () => {
      const next = toggleMapFavorite(baseMeta, "map-2");
      expect("map-2" in next.mapMeta).toBe(false);
    });

    it("未登録マップをお気に入りにできる", () => {
      const next = toggleMapFavorite(baseMeta, "map-3");
      expect(next.mapMeta["map-3"]).toEqual({ favorite: true });
    });
  });

  describe("recordMapOpened", () => {
    it("他の既存フィールドを保ったまま lastOpenedAt を更新する（L-454, L-538）", () => {
      const next = recordMapOpened(baseMeta, "map-1", T3);
      expect(next.mapMeta["map-1"]).toEqual({
        favorite: true,
        lastOpenedAt: T3,
        folderId: "f-1",
      });
      expect(baseMeta.mapMeta["map-1"].lastOpenedAt).toBe(T1);
    });

    it("未登録マップにも lastOpenedAt を記録できる", () => {
      const next = recordMapOpened(baseMeta, "map-new", T2);
      expect(next.mapMeta["map-new"]).toEqual({ lastOpenedAt: T2 });
      expect("favorite" in next.mapMeta["map-new"]).toBe(false);
      expect("folderId" in next.mapMeta["map-new"]).toBe(false);
    });
  });

  describe("assignMapFolder", () => {
    it("既存フォルダーへの割り当てと未分類化（null）で他のフィールドを維持する（L-454）", () => {
      const moved = assignMapFolder(baseMeta, "map-1", "f-2");
      expect(moved).toEqual({
        ok: true,
        meta: {
          ...baseMeta,
          mapMeta: {
            ...baseMeta.mapMeta,
            "map-1": { favorite: true, lastOpenedAt: T1, folderId: "f-2" },
          },
        },
      });

      const unclassified = assignMapFolder(baseMeta, "map-1", null);
      expect(unclassified.ok).toBe(true);
      if (unclassified.ok) {
        expect(unclassified.meta.mapMeta["map-1"]).toEqual({
          favorite: true,
          lastOpenedAt: T1,
        });
        expect("folderId" in unclassified.meta.mapMeta["map-1"]).toBe(false);
      }
    });

    it("folderId のみ持つエントリを null にするとエントリごと削除する", () => {
      const metaWithOnlyFolder: MapLibraryMetaV1 = {
        version: 1,
        folders: [makeFolder("f-1", "仕事")],
        mapMeta: { "map-1": { folderId: "f-1" } },
      };

      const result = assignMapFolder(metaWithOnlyFolder, "map-1", null);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect("map-1" in result.meta.mapMeta).toBe(false);
      }
    });

    it("存在しない folderId は folder-missing で拒否する", () => {
      expect(assignMapFolder(baseMeta, "map-1", "missing")).toEqual({
        ok: false,
        reason: "folder-missing",
      });
    });
  });

  describe("createMapFolder", () => {
    it("フォルダー名を正規化して追加する", () => {
      const result = createMapFolder(baseMeta, "f-3", "  学習  メモ  ", T2);
      expect(result).toEqual({
        ok: true,
        folder: makeFolder("f-3", "学習 メモ", T2, T2),
        meta: {
          ...baseMeta,
          folders: [...baseMeta.folders, makeFolder("f-3", "学習 メモ", T2, T2)],
        },
      });
    });

    it("不正な ID や既存 ID の重複は invalid-id で拒否する", () => {
      expect(createMapFolder(baseMeta, "bad id", "新規", T2)).toEqual({
        ok: false,
        reason: "invalid-id",
      });
      expect(createMapFolder(baseMeta, "f-1", "新規", T2)).toEqual({
        ok: false,
        reason: "invalid-id",
      });
    });

    it("名前が重複（NFKC/小文字化一致）している場合は duplicate で拒否する", () => {
      const meta: MapLibraryMetaV1 = {
        version: 1,
        folders: [makeFolder("f-1", "Project A")],
        mapMeta: {},
      };
      expect(createMapFolder(meta, "f-2", "ｐｒｏｊｅｃｔ　a", T2)).toEqual({
        ok: false,
        reason: "duplicate",
      });
    });

    it("上限 50 件に達している場合は too-many で拒否する", () => {
      const fullMeta: MapLibraryMetaV1 = {
        version: 1,
        folders: makeFolders(MAX_MAP_FOLDERS),
        mapMeta: {},
      };
      expect(createMapFolder(fullMeta, "f-new", "51件目", T2)).toEqual({
        ok: false,
        reason: "too-many",
      });
    });
  });

  describe("renameMapFolder", () => {
    it("対象フォルダーの名前と updatedAt を更新し createdAt を維持する", () => {
      const result = renameMapFolder(baseMeta, "f-1", "  仕事  案件 ", T3);
      expect(result).toEqual({
        ok: true,
        folder: makeFolder("f-1", "仕事 案件", T1, T3),
        meta: {
          ...baseMeta,
          folders: [
            makeFolder("f-1", "仕事 案件", T1, T3),
            makeFolder("f-2", "趣味", T1, T1),
          ],
        },
      });
    });

    it("同じフォルダー自身の表記違い（大文字小文字変更）は許可する", () => {
      const meta: MapLibraryMetaV1 = {
        version: 1,
        folders: [makeFolder("f-1", "work", T1, T1)],
        mapMeta: {},
      };
      const result = renameMapFolder(meta, "f-1", "Work", T2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.folder.name).toBe("Work");
      }
    });

    it("存在しない folderId は folder-missing、他フォルダーとの重複は duplicate で拒否する", () => {
      expect(renameMapFolder(baseMeta, "missing", "新名", T2)).toEqual({
        ok: false,
        reason: "folder-missing",
      });
      expect(renameMapFolder(baseMeta, "f-1", "趣味", T2)).toEqual({
        ok: false,
        reason: "duplicate",
      });
    });
  });

  describe("deleteMapFolder", () => {
    it("フォルダーを削除し、参照していたマップの folderId のみを除去する（マップ・他属性は残す）", () => {
      const meta: MapLibraryMetaV1 = {
        version: 1,
        folders: [makeFolder("f-1", "仕事"), makeFolder("f-2", "趣味")],
        mapMeta: {
          "map-1": { favorite: true, lastOpenedAt: T1, folderId: "f-1" },
          "map-2": { folderId: "f-1" },
          "map-3": { folderId: "f-2" },
        },
      };

      const result = deleteMapFolder(meta, "f-1");
      expect(result).toEqual({
        ok: true,
        meta: {
          version: 1,
          folders: [makeFolder("f-2", "趣味")],
          mapMeta: {
            "map-1": { favorite: true, lastOpenedAt: T1 },
            "map-3": { folderId: "f-2" },
          },
        },
      });
      if (result.ok) {
        expect("folderId" in result.meta.mapMeta["map-1"]).toBe(false);
        expect("map-2" in result.meta.mapMeta).toBe(false);
      }
    });

    it("存在しない folderId は folder-missing で拒否する", () => {
      expect(deleteMapFolder(baseMeta, "missing")).toEqual({
        ok: false,
        reason: "folder-missing",
      });
    });
  });

  describe("pruneMapMetaForRemovedMap", () => {
    it("指定された mapId のエントリのみ削除し、存在しない mapId でも安全に扱う", () => {
      const pruned = pruneMapMetaForRemovedMap(baseMeta, "map-1");
      expect("map-1" in pruned.mapMeta).toBe(false);
      expect(pruned.mapMeta["map-2"]).toEqual({ favorite: true });
      expect(pruned.folders).toEqual(baseMeta.folders);

      const noop = pruneMapMetaForRemovedMap(baseMeta, "non-existent");
      expect(noop).toEqual(baseMeta);
    });
  });
});

describe("filterAndSortMapsForList", () => {
  const maps: readonly MapIndexEntry[] = [
    makeMapEntry({ id: "map-1", updatedAt: "2026-11-01T00:00:00.000Z" }),
    makeMapEntry({ id: "map-2", updatedAt: "2026-11-03T00:00:00.000Z" }),
    makeMapEntry({ id: "map-3", updatedAt: "2026-11-02T00:00:00.000Z" }),
    makeMapEntry({ id: "map-4", updatedAt: "2026-11-04T00:00:00.000Z" }),
  ];

  const meta: MapLibraryMetaV1 = {
    version: 1,
    folders: [makeFolder("f-1", "仕事"), makeFolder("f-2", "趣味")],
    mapMeta: {
      "map-1": {
        favorite: true,
        lastOpenedAt: "2026-11-10T00:00:00.000Z",
        folderId: "f-1",
      },
      "map-2": {
        lastOpenedAt: "2026-11-09T00:00:00.000Z",
        folderId: "f-1",
      },
      "map-3": {
        favorite: true,
        lastOpenedAt: "2026-11-10T00:00:00.000Z",
      },
      // map-4 は未分類・お気に入りなし・lastOpenedAt 未記録
    },
  };

  it("原本 maps 配列を破壊せず、all タブで表示順に並べ替える（L-460）", () => {
    const originalIds = maps.map((m) => m.id);
    const result = filterAndSortMapsForList(maps, meta, {
      tab: "all",
      folderFilter: { kind: "all" },
    });

    expect(result.map((m) => m.id)).toEqual(["map-4", "map-2", "map-3", "map-1"]);
    expect(maps.map((m) => m.id)).toEqual(originalIds);
  });

  it("folderFilter（unclassified / folder）で先に絞り込む", () => {
    expect(
      filterAndSortMapsForList(maps, meta, {
        tab: "all",
        folderFilter: { kind: "unclassified" },
      }).map((m) => m.id),
    ).toEqual(["map-4", "map-3"]);

    expect(
      filterAndSortMapsForList(maps, meta, {
        tab: "all",
        folderFilter: { kind: "folder", folderId: "f-1" },
      }).map((m) => m.id),
    ).toEqual(["map-2", "map-1"]);
  });

  it("favorites タブはお気に入り登録済みのみを表示順で返す", () => {
    expect(
      filterAndSortMapsForList(maps, meta, {
        tab: "favorites",
        folderFilter: { kind: "all" },
      }).map((m) => m.id),
    ).toEqual(["map-3", "map-1"]);

    expect(
      filterAndSortMapsForList(maps, meta, {
        tab: "favorites",
        folderFilter: { kind: "folder", folderId: "f-1" },
      }).map((m) => m.id),
    ).toEqual(["map-1"]);
  });

  it("アーカイブ済みマップは all / favorites / recent から除外し、archived タブに archivedAt 降順で表示する", () => {
    const archivedMeta: MapLibraryMetaV1 = {
      ...meta,
      mapMeta: {
        ...meta.mapMeta,
        "map-1": {
          ...meta.mapMeta["map-1"],
          archivedAt: "2026-11-12T00:00:00.000Z",
        },
        "map-2": {
          ...meta.mapMeta["map-2"],
          archivedAt: "2026-11-11T00:00:00.000Z",
        },
        "map-3": {
          ...meta.mapMeta["map-3"],
          archivedAt: "2026-11-10T00:00:00.000Z",
        },
        "map-z": {
          archivedAt: "2026-11-10T00:00:00.000Z",
        },
        "map-a": {
          archivedAt: "2026-11-10T00:00:00.000Z",
        },
        "map-4": {
          lastOpenedAt: "2026-11-08T00:00:00.000Z",
        },
      },
    };
    const archivedMaps: readonly MapIndexEntry[] = [
      ...maps,
      makeMapEntry({ id: "map-z", updatedAt: "2026-11-01T00:00:00.000Z" }),
      makeMapEntry({ id: "map-a", updatedAt: "2026-11-02T00:00:00.000Z" }),
    ];
    const opts = { folderFilter: { kind: "all" as const } };

    expect(
      filterAndSortMapsForList(archivedMaps, archivedMeta, { tab: "all", ...opts }).map(
        (m) => m.id,
      ),
    ).not.toContain("map-1");
    expect(
      filterAndSortMapsForList(archivedMaps, archivedMeta, { tab: "all", ...opts }).map(
        (m) => m.id,
      ),
    ).toContain("map-4");

    expect(
      filterAndSortMapsForList(archivedMaps, archivedMeta, {
        tab: "favorites",
        ...opts,
      }).map((m) => m.id),
    ).toEqual([]);

    expect(
      filterAndSortMapsForList(archivedMaps, archivedMeta, {
        tab: "recent",
        ...opts,
      }).map((m) => m.id),
    ).toEqual(["map-4"]);

    expect(
      filterAndSortMapsForList(archivedMaps, archivedMeta, {
        tab: "archived",
        ...opts,
      }).map((m) => m.id),
    ).toEqual(["map-1", "map-2", "map-3", "map-a", "map-z"]);
  });

  it("recent タブは lastOpenedAt 未記録を除外し、lastOpenedAt 降順 → id 昇順で最大 20 件を返す", () => {
    const recent = filterAndSortMapsForList(maps, meta, {
      tab: "recent",
      folderFilter: { kind: "all" },
    });
    // map-1 と map-3 は同じ lastOpenedAt なので id 昇順（map-1 → map-3）、map-4 は未記録なので除外
    expect(recent.map((m) => m.id)).toEqual(["map-1", "map-3", "map-2"]);

    // 25 件（20 件は未分類で新しく、5 件は f-1 で古い）で、上限 20 件と「先フォルダー絞り込み → 次 recent」を検証
    const manyMaps = Array.from({ length: 25 }, (_, i) =>
      makeMapEntry({ id: `m-${String(i + 1).padStart(2, "0")}` }),
    );
    const manyMapMeta: Record<string, MapUserMeta> = {};
    for (let i = 0; i < 25; i += 1) {
      const id = `m-${String(i + 1).padStart(2, "0")}`;
      const minute = String(i + 1).padStart(2, "0");
      manyMapMeta[id] = {
        lastOpenedAt: `2026-11-10T00:${minute}:00.000Z`,
        ...(i < 5 ? { folderId: "f-1" } : {}),
      };
    }
    const manyMeta: MapLibraryMetaV1 = {
      version: 1,
      folders: [makeFolder("f-1", "仕事")],
      mapMeta: manyMapMeta,
    };

    const allRecent = filterAndSortMapsForList(manyMaps, manyMeta, {
      tab: "recent",
      folderFilter: { kind: "all" },
    });
    expect(allRecent).toHaveLength(MAX_RECENT_MAPS);
    expect(allRecent[0].id).toBe("m-25");
    expect(allRecent[19].id).toBe("m-06");

    // 全体の上位 20 件に入らない m-01〜m-05 も、folderFilter が先に効くため f-1 指定時は 5 件とも返る
    const folderRecent = filterAndSortMapsForList(manyMaps, manyMeta, {
      tab: "recent",
      folderFilter: { kind: "folder", folderId: "f-1" },
    });
    expect(folderRecent.map((m) => m.id)).toEqual([
      "m-05",
      "m-04",
      "m-03",
      "m-02",
      "m-01",
    ]);
  });
});

describe("mergeLibraryMetaForRestore", () => {
  it("同名フォルダーは既存へ合流し、ID 衝突する別名フォルダーは新 ID を採番し、mapMeta の ID を付け替える", () => {
    const existing: MapLibraryMetaV1 = {
      version: 1,
      folders: [
        makeFolder("f-1", "Work", T1, T1),
        makeFolder("f-2", "既存別名", T1, T1),
      ],
      mapMeta: {
        "existing-map": { favorite: true, folderId: "f-1" },
      },
    };

    const backupFolders: MapFolder[] = [
      makeFolder("bf-same", "ｗｏｒｋ", T2, T2), // 既存 f-1 と同名（NFKC/小文字化一致）→ 合流
      makeFolder("f-2", "バックアップ新規", T2, T2), // ID が既存 f-2 と衝突 → 新 ID 採番
      makeFolder("bf-clean", "別フォルダー", T2, T2), // 衝突なし → そのまま追加
    ];
    const backupMapMeta: Record<string, MapUserMeta> = {
      "old-1": { favorite: true, lastOpenedAt: T2, folderId: "bf-same" },
      "old-2": { folderId: "f-2" },
      "old-3": { lastOpenedAt: T3, folderId: "bf-clean" },
      "unmapped-old": { favorite: true },
    };
    const mapIdMapping = new Map([
      ["old-1", "new-1"],
      ["old-2", "new-2"],
      ["old-3", "new-3"],
    ]);

    let seq = 0;
    const generateId = () => `gen-folder-${++seq}`;

    const result = mergeLibraryMetaForRestore(
      existing,
      backupFolders,
      backupMapMeta,
      mapIdMapping,
      generateId,
    );

    expect(result.droppedFolderCount).toBe(0);
    expect(result.meta.folders).toEqual([
      makeFolder("f-1", "Work", T1, T1),
      makeFolder("f-2", "既存別名", T1, T1),
      makeFolder("gen-folder-1", "バックアップ新規", T2, T2),
      makeFolder("bf-clean", "別フォルダー", T2, T2),
    ]);
    expect(result.meta.mapMeta).toEqual({
      "existing-map": { favorite: true, folderId: "f-1" },
      "new-1": { favorite: true, lastOpenedAt: T2, folderId: "f-1" },
      "new-2": { folderId: "gen-folder-1" },
      "new-3": { lastOpenedAt: T3, folderId: "bf-clean" },
    });
    // 既存メタを破壊しない
    expect(existing.folders).toHaveLength(2);
    expect("new-1" in existing.mapMeta).toBe(false);
  });

  it("バックアップ mapMeta の archivedAt を復元マップへ引き継ぐ", () => {
    const existing = createEmptyMapLibraryMeta();
    const backupMapMeta: Record<string, MapUserMeta> = {
      "old-1": { favorite: true, archivedAt: T3 },
    };

    const result = mergeLibraryMetaForRestore(
      existing,
      undefined,
      backupMapMeta,
      new Map([["old-1", "new-1"]]),
      () => "unused",
    );

    expect(result.meta.mapMeta["new-1"]).toEqual({
      favorite: true,
      archivedAt: T3,
    });
  });

  it("合計 50 件上限を超えるフォルダーは追加せず droppedFolderCount を数え、参照マップを未分類化する", () => {
    const existing: MapLibraryMetaV1 = {
      version: 1,
      folders: makeFolders(49, "ex"),
      mapMeta: {},
    };
    const backupFolders: MapFolder[] = [
      makeFolder("bf-1", "追加できる1件目"),
      makeFolder("bf-2", "上限超過1件目"),
      makeFolder("bf-3", "上限超過2件目"),
    ];
    const backupMapMeta: Record<string, MapUserMeta> = {
      "old-1": { folderId: "bf-1" },
      "old-2": { favorite: true, folderId: "bf-2" },
      "old-3": { folderId: "bf-3" },
    };
    const mapIdMapping = new Map([
      ["old-1", "new-1"],
      ["old-2", "new-2"],
      ["old-3", "new-3"],
    ]);

    const result = mergeLibraryMetaForRestore(
      existing,
      backupFolders,
      backupMapMeta,
      mapIdMapping,
      () => "unused",
    );

    expect(result.droppedFolderCount).toBe(2);
    expect(result.meta.folders).toHaveLength(MAX_MAP_FOLDERS);
    expect(result.meta.mapMeta["new-1"]).toEqual({ folderId: "bf-1" });
    expect(result.meta.mapMeta["new-2"]).toEqual({ favorite: true });
    expect("folderId" in result.meta.mapMeta["new-2"]).toBe(false);
    // folderId のみで未分類化され空になったエントリは残さない
    expect("new-3" in result.meta.mapMeta).toBe(false);
  });

  it("backupFolders・backupMapMeta が省略されても既存メタをそのまま保つ", () => {
    const existing: MapLibraryMetaV1 = {
      version: 1,
      folders: [makeFolder("f-1", "仕事")],
      mapMeta: { "map-1": { favorite: true } },
    };

    const result = mergeLibraryMetaForRestore(
      existing,
      undefined,
      undefined,
      new Map(),
      () => "unused",
    );

    expect(result).toEqual({ meta: existing, droppedFolderCount: 0 });
  });

  it("既存フォルダーが上限 50 件でも同名フォルダーは既存へ合流し droppedFolderCount に計上しない", () => {
    const existing: MapLibraryMetaV1 = {
      version: 1,
      folders: makeFolders(MAX_MAP_FOLDERS, "ex"),
      mapMeta: {},
    };
    // ex-1 の名前は "フォルダー 1"
    const backupFolders: MapFolder[] = [
      makeFolder("bf-same", "フォルダー　１"),
      makeFolder("bf-new", "完全に新しいフォルダー"),
    ];
    const backupMapMeta: Record<string, MapUserMeta> = {
      "old-1": { folderId: "bf-same" },
      "old-2": { favorite: true, folderId: "bf-new" },
    };
    const mapIdMapping = new Map([
      ["old-1", "new-1"],
      ["old-2", "new-2"],
    ]);

    const result = mergeLibraryMetaForRestore(
      existing,
      backupFolders,
      backupMapMeta,
      mapIdMapping,
      () => "unused",
    );

    expect(result.droppedFolderCount).toBe(1);
    expect(result.meta.folders).toHaveLength(MAX_MAP_FOLDERS);
    expect(result.meta.mapMeta["new-1"]).toEqual({ folderId: "ex-1" });
    expect(result.meta.mapMeta["new-2"]).toEqual({ favorite: true });
    expect("folderId" in result.meta.mapMeta["new-2"]).toBe(false);
  });

  it("ID 衝突時に generateId が不正・重複 ID を返してもリトライして採番し、上限超過時は droppedFolderCount に計上して未分類化する", () => {
    const existing: MapLibraryMetaV1 = {
      version: 1,
      folders: [makeFolder("f-1", "既存1"), makeFolder("f-2", "既存2")],
      mapMeta: {},
    };

    // リトライで採番成功するケース（不正 ID → 既存重複 → 有効 ID）
    const candidates = ["bad id", "f-2", "gen-ok"];
    let cursor = 0;
    const retryResult = mergeLibraryMetaForRestore(
      existing,
      [makeFolder("f-1", "バックアップ別名")],
      { "old-1": { folderId: "f-1" } },
      new Map([["old-1", "new-1"]]),
      () => candidates[cursor++] ?? "fallback",
    );

    expect(retryResult.droppedFolderCount).toBe(0);
    expect(retryResult.meta.folders[2]).toEqual(
      makeFolder("gen-ok", "バックアップ別名"),
    );
    expect(retryResult.meta.mapMeta["new-1"]).toEqual({ folderId: "gen-ok" });

    // リトライ上限超過で採番不能なケース（常に既存衝突 ID を返す）
    const exhaustResult = mergeLibraryMetaForRestore(
      existing,
      [makeFolder("f-1", "採番不能フォルダー")],
      {
        "old-1": { favorite: true, folderId: "f-1" },
        "old-2": { folderId: "f-1" },
      },
      new Map([
        ["old-1", "new-1"],
        ["old-2", "new-2"],
      ]),
      () => "f-2",
    );

    expect(exhaustResult.droppedFolderCount).toBe(1);
    expect(exhaustResult.meta.folders).toHaveLength(2);
    expect(exhaustResult.meta.mapMeta["new-1"]).toEqual({ favorite: true });
    expect("folderId" in exhaustResult.meta.mapMeta["new-1"]).toBe(false);
    expect("new-2" in exhaustResult.meta.mapMeta).toBe(false);
  });
});

describe("validateBackupLibraryMeta", () => {
  const validMapIds = new Set(["map-1", "map-2"]);

  it("両方省略時は空成功（キーなし）を返す", () => {
    const result = validateBackupLibraryMeta(undefined, undefined, validMapIds);
    expect(result).toEqual({ ok: true });
    if (result.ok) {
      expect("folders" in result).toBe(false);
      expect("mapMeta" in result).toBe(false);
    }
  });

  it("正当な folders と mapMeta を検証して返す", () => {
    const folders = [makeFolder("f-1", "仕事", T1, T2)];
    const mapMeta = {
      "map-1": { favorite: true, lastOpenedAt: T2, folderId: "f-1" },
      "map-2": { lastOpenedAt: T1 },
    };

    expect(validateBackupLibraryMeta(folders, mapMeta, validMapIds)).toEqual({
      ok: true,
      folders,
      mapMeta,
    });
  });

  it("mapMeta 件数が validMapIds.size を超える場合は先行拒否する（L-443）", () => {
    const oversized = {
      "map-1": { favorite: true },
      "map-2": { favorite: true },
      "map-3": { favorite: true },
    };

    const result = validateBackupLibraryMeta(undefined, oversized, validMapIds);
    expect(result.ok).toBe(false);
  });

  it("バックアップに存在しない mapId や存在しない folderId を拒否する", () => {
    const unknownMap = validateBackupLibraryMeta(
      [makeFolder("f-1", "仕事")],
      { "map-unknown": { favorite: true } },
      validMapIds,
    );
    expect(unknownMap.ok).toBe(false);

    const unknownFolder = validateBackupLibraryMeta(
      [makeFolder("f-1", "仕事")],
      { "map-1": { folderId: "f-missing" } },
      validMapIds,
    );
    expect(unknownFolder.ok).toBe(false);

    const folderWithoutFoldersField = validateBackupLibraryMeta(
      undefined,
      { "map-1": { folderId: "f-1" } },
      validMapIds,
    );
    expect(folderWithoutFoldersField.ok).toBe(false);
  });

  it.each<[string, unknown, unknown]>([
    ["folders が配列でない", "bad", undefined],
    ["folders が上限 50 超過", makeFolders(MAX_MAP_FOLDERS + 1), undefined],
    [
      "folder に未知キー",
      [{ ...makeFolder("f-1", "仕事"), extra: 1 }],
      undefined,
    ],
    [
      "folder 名が未正規化",
      [makeFolder("f-1", " 仕事 ")],
      undefined,
    ],
    [
      "folder 名が重複",
      [makeFolder("f-1", "Work"), makeFolder("f-2", "work")],
      undefined,
    ],
    [
      "folder 日時が不正",
      [makeFolder("f-1", "仕事", "invalid", T1)],
      undefined,
    ],
    ["mapMeta が非プレーンオブジェクト", undefined, []],
    [
      "mapMeta エントリに未知キー",
      undefined,
      { "map-1": { favorite: true, unknown: 1 } },
    ],
    [
      "mapMeta の favorite が非 boolean",
      undefined,
      { "map-1": { favorite: 1 } },
    ],
    [
      "mapMeta の lastOpenedAt が不正",
      undefined,
      { "map-1": { lastOpenedAt: "2026-11-01" } },
    ],
    [
      "mapMeta の folderId 形式が不正",
      [makeFolder("f-1", "仕事")],
      { "map-1": { folderId: "bad id" } },
    ],
  ])("%s を拒否する", (_label, folders, mapMeta) => {
    const result = validateBackupLibraryMeta(folders, mapMeta, validMapIds);
    expect(result.ok).toBe(false);
  });

  it("favorite: false や空エントリを規約通りに正規化して返し、空になった場合はキーを省略する", () => {
    const result = validateBackupLibraryMeta(
      [],
      { "map-1": { favorite: false, lastOpenedAt: T1 }, "map-2": { favorite: false } },
      validMapIds,
    );
    expect(result).toEqual({
      ok: true,
      mapMeta: { "map-1": { lastOpenedAt: T1 } },
    });
    if (result.ok) {
      expect("folders" in result).toBe(false);
      expect(result.mapMeta && "favorite" in result.mapMeta["map-1"]).toBe(false);
      expect(result.mapMeta && "map-2" in result.mapMeta).toBe(false);
    }
  });
});

describe("危険キー（__proto__ / constructor / toString）の安全な扱い", () => {
  const DANGEROUS_KEYS = ["__proto__", "constructor", "toString"] as const;

  it("トップレベル・フォルダー・mapMeta エントリの未知キーとしての危険キーを拒否する", () => {
    for (const key of DANGEROUS_KEYS) {
      const topRaw = `{"version":1,"folders":[],"mapMeta":{},"${key}":true}`;
      expect(decodeMapLibraryMeta(topRaw)).toEqual({
        ok: false,
        reason: "corrupt",
      });

      const folderRaw = `{"version":1,"folders":[{"id":"f-1","name":"仕事","createdAt":"${T1}","updatedAt":"${T1}","${key}":true}],"mapMeta":{}}`;
      expect(decodeMapLibraryMeta(folderRaw)).toEqual({
        ok: false,
        reason: "corrupt",
      });

      const entryRaw = `{"version":1,"folders":[],"mapMeta":{"map-1":{"favorite":true,"${key}":true}}}`;
      expect(decodeMapLibraryMeta(entryRaw)).toEqual({
        ok: false,
        reason: "corrupt",
      });
    }
  });

  it("mapMeta のキーとして __proto__ / constructor / toString を扱ってもプロトタイプ汚染やエントリ消失が起きない", () => {
    const raw =
      `{"version":1,"folders":[{"id":"f-1","name":"仕事","createdAt":"${T1}","updatedAt":"${T1}"}],` +
      `"mapMeta":{"__proto__":{"favorite":true,"lastOpenedAt":"${T1}","folderId":"f-1"},` +
      `"constructor":{"favorite":true,"folderId":"f-1"},` +
      `"toString":{"lastOpenedAt":"${T2}"}}}`;

    const decoded = decodeMapLibraryMeta(raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(Object.getPrototypeOf(decoded.meta.mapMeta)).toBe(Object.prototype);
    for (const key of DANGEROUS_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(decoded.meta.mapMeta, key)).toBe(
        true,
      );
    }
    expect(decoded.meta.mapMeta["__proto__"]).toEqual({
      favorite: true,
      lastOpenedAt: T1,
      folderId: "f-1",
    });

    // encode → decode 往復
    const roundTrip = decodeMapLibraryMeta(encodeMapLibraryMeta(decoded.meta));
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) {
      expect(Object.getPrototypeOf(roundTrip.meta.mapMeta)).toBe(
        Object.prototype,
      );
      expect(
        Object.prototype.hasOwnProperty.call(
          roundTrip.meta.mapMeta,
          "__proto__",
        ),
      ).toBe(true);
    }

    // toggleMapFavorite / recordMapOpened / assignMapFolder / deleteMapFolder / pruneMapMetaForRemovedMap
    const toggled = toggleMapFavorite(decoded.meta, "__proto__");
    expect(Object.getPrototypeOf(toggled.mapMeta)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(toggled.mapMeta, "__proto__")).toBe(
      true,
    );
    expect(toggled.mapMeta["__proto__"]).toEqual({
      lastOpenedAt: T1,
      folderId: "f-1",
    });

    const opened = recordMapOpened(toggled, "__proto__", T3);
    expect(Object.getPrototypeOf(opened.mapMeta)).toBe(Object.prototype);
    expect(opened.mapMeta["__proto__"]).toEqual({
      lastOpenedAt: T3,
      folderId: "f-1",
    });

    const assigned = assignMapFolder(opened, "toString", "f-1");
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(Object.getPrototypeOf(assigned.meta.mapMeta)).toBe(Object.prototype);
    expect(assigned.meta.mapMeta["toString"]).toEqual({
      lastOpenedAt: T2,
      folderId: "f-1",
    });

    // filterAndSortMapsForList
    const dangerousMaps: MapIndexEntry[] = [
      makeMapEntry({ id: "__proto__", updatedAt: T1 }),
      makeMapEntry({ id: "constructor", updatedAt: T2 }),
      makeMapEntry({ id: "toString", updatedAt: T3 }),
    ];
    expect(
      filterAndSortMapsForList(dangerousMaps, assigned.meta, {
        tab: "recent",
        folderFilter: { kind: "folder", folderId: "f-1" },
      }).map((m) => m.id),
    ).toEqual(["__proto__", "toString"]);

    // deleteMapFolder
    const deleted = deleteMapFolder(assigned.meta, "f-1");
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(Object.getPrototypeOf(deleted.meta.mapMeta)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(deleted.meta.mapMeta, "__proto__"),
    ).toBe(true);
    expect(deleted.meta.mapMeta["__proto__"]).toEqual({ lastOpenedAt: T3 });
    expect(deleted.meta.mapMeta["constructor"]).toEqual({ favorite: true });

    // pruneMapMetaForRemovedMap
    const pruned = pruneMapMetaForRemovedMap(deleted.meta, "__proto__");
    expect(Object.getPrototypeOf(pruned.mapMeta)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(pruned.mapMeta, "__proto__"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(pruned.mapMeta, "constructor"),
    ).toBe(true);

    // mergeLibraryMetaForRestore
    const backupMapMeta: Record<string, MapUserMeta> = {};
    Object.defineProperty(backupMapMeta, "old-proto", {
      value: { favorite: true, lastOpenedAt: T2 },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const merged = mergeLibraryMetaForRestore(
      createEmptyMapLibraryMeta(),
      undefined,
      backupMapMeta,
      new Map([["old-proto", "__proto__"]]),
      () => "unused",
    );
    expect(Object.getPrototypeOf(merged.meta.mapMeta)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(merged.meta.mapMeta, "__proto__"),
    ).toBe(true);
    expect(merged.meta.mapMeta["__proto__"]).toEqual({
      favorite: true,
      lastOpenedAt: T2,
    });

    // validateBackupLibraryMeta
    const rawBackupMeta: unknown = JSON.parse(
      `{"__proto__":{"favorite":true,"folderId":"f-1"},"constructor":{"lastOpenedAt":"${T1}"}}`,
    );
    const validated = validateBackupLibraryMeta(
      [makeFolder("f-1", "仕事")],
      rawBackupMeta,
      new Set(["__proto__", "constructor"]),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok || validated.mapMeta === undefined) return;
    expect(Object.getPrototypeOf(validated.mapMeta)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(validated.mapMeta, "__proto__"),
    ).toBe(true);
    expect(validated.mapMeta["__proto__"]).toEqual({
      favorite: true,
      folderId: "f-1",
    });
  });
});

describe("countMapsByFolder", () => {
  it("一覧にあるマップだけをフォルダーごとに数え、未分類と一覧に無いマップは数えない", () => {
    const meta: MapLibraryMetaV1 = {
      ...createEmptyMapLibraryMeta(),
      folders: [makeFolder("f-1", "A"), makeFolder("f-2", "B")],
      mapMeta: {
        m1: { folderId: "f-1" },
        m2: { folderId: "f-1", favorite: true },
        m3: { folderId: "f-2" },
        m4: { favorite: true },
        gone: { folderId: "f-2" },
      },
    };
    const maps = ["m1", "m2", "m3", "m4", "m5"].map((id) => makeMapEntry({ id }));

    const counts = countMapsByFolder(maps, meta);

    expect([...counts.entries()]).toEqual([["f-1", 2], ["f-2", 1]]);
  });

  it("__proto__ のような継承キーを所属として数えない", () => {
    const counts = countMapsByFolder(
      [makeMapEntry({ id: "__proto__" }), makeMapEntry({ id: "toString" })],
      createEmptyMapLibraryMeta(),
    );
    expect(counts.size).toBe(0);
  });
});
