import {
  MAX_LIBRARY_BACKUP_BYTES,
  MAX_LIBRARY_BACKUP_MAPS,
  createLibraryBackup,
  decodeLibraryBackup,
  parseLibraryBackupJson,
  type LibraryBackupMap,
} from "@/domain/mapLibrary/libraryBackupCodec";
import {
  MAX_MAP_FOLDERS,
  type MapFolder,
  type MapUserMeta,
} from "@/domain/mapLibrary/mapLibraryMeta";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { MapDocumentV3 } from "@/types/mapDocument";

const timestamp = "2026-11-05T00:00:00.000Z";
const emptyDocument: MapDocumentV3 = { version: 3, layoutMode: "manual", nodes: [] };
const map: LibraryBackupMap = {
  id: "source-a",
  name: "旅行",
  createdAt: timestamp,
  updatedAt: timestamp,
  document: emptyDocument,
};
const backup = {
  format: "draw-my-map-library-backup",
  version: 1,
  exportedAt: timestamp,
  currentMapId: "source-a",
  maps: [map],
};

describe("libraryBackupCodec", () => {
  it("正規 V3 を JSON に書き出し、再読込して元の ID と日時を保つ", () => {
    const created = createLibraryBackup([map], "source-a", timestamp);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.backup).toEqual(backup);
    expect(created.value.byteSize).toBe(new Blob([created.value.json]).size);
    expect(parseLibraryBackupJson(created.value.json)).toEqual({ ok: true, value: backup });
  });

  it("ノードの illustration を round-trip し、マップ行や文書内の余分なキーを除く", () => {
    const illustration = createJpegDataUrl(128, 128);
    const node = createTestNode({ id: 1, parentId: null, height: 116, illustration });
    const source = {
      ...backup,
      maps: [{
        ...map,
        ignored: "row",
        document: {
          version: 3,
          layoutMode: "manual",
          ignored: "document",
          nodes: [{ ...node, ignored: "node" }],
        },
      }],
    };
    const decoded = decodeLibraryBackup(source);
    expect(decoded).toEqual({
      ok: true,
      value: {
        ...backup,
        maps: [{ ...map, document: { version: 3, layoutMode: "manual", nodes: [node] } }],
      },
    });
    if (!decoded.ok) return;
    const created = createLibraryBackup(decoded.value.maps, decoded.value.currentMapId, decoded.value.exportedAt);
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(JSON.parse(created.value.json)).toEqual(decoded.value);
      expect(created.value.json).toContain(illustration);
    }
  });

  it("トップレベルの未知キーと危険キー __proto__ を拒否する", () => {
    expect(decodeLibraryBackup({ ...backup, ignored: "outer" }).ok).toBe(false);
    expect(parseLibraryBackupJson(JSON.stringify({ ...backup, ignored: "outer" })).ok).toBe(false);
    const protoRaw = `{"format":"draw-my-map-library-backup","version":1,"exportedAt":"${timestamp}","currentMapId":"source-a","maps":[${JSON.stringify(map)}],"__proto__":{"polluted":true}}`;
    expect(parseLibraryBackupJson(protoRaw).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("folders / mapMeta が無い旧 V1 バックアップを後方互換でデコードし、キーを持たせない", () => {
    const parsed = parseLibraryBackupJson(JSON.stringify(backup));
    expect(parsed).toEqual({ ok: true, value: backup });
    if (!parsed.ok) return;
    expect(Object.prototype.hasOwnProperty.call(parsed.value, "folders")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed.value, "mapMeta")).toBe(false);
  });

  it("folders / mapMeta 付きバックアップを create / parse / decode で往復できる", () => {
    const mapB: LibraryBackupMap = { ...map, id: "source-b", name: "仕事" };
    const folders: MapFolder[] = [
      { id: "folder-1", name: "プロジェクト", createdAt: timestamp, updatedAt: timestamp },
      { id: "folder-empty", name: "空フォルダー", createdAt: timestamp, updatedAt: timestamp },
    ];
    const mapMeta: Record<string, MapUserMeta> = {
      "source-a": { favorite: true, lastOpenedAt: timestamp, folderId: "folder-1", archivedAt: timestamp },
      "source-b": { lastOpenedAt: "2026-11-06T00:00:00.000Z" },
    };
    const created = createLibraryBackup([map, mapB], "source-a", timestamp, { folders, mapMeta });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.backup).toEqual({
      ...backup,
      maps: [map, mapB],
      folders,
      mapMeta,
    });
    expect(parseLibraryBackupJson(created.value.json)).toEqual({
      ok: true,
      value: created.value.backup,
    });
    expect(decodeLibraryBackup(created.value.backup)).toEqual({
      ok: true,
      value: created.value.backup,
    });
  });

  it("空の folders / mapMeta を渡しても出力からキーを省略する", () => {
    const created = createLibraryBackup([map], "source-a", timestamp, { folders: [], mapMeta: {} });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.backup).toEqual(backup);
    expect(Object.prototype.hasOwnProperty.call(created.value.backup, "folders")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(created.value.backup, "mapMeta")).toBe(false);
    const parsedJson = JSON.parse(created.value.json) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsedJson, "folders")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsedJson, "mapMeta")).toBe(false);
  });

  it("folders / mapMeta の不正値（件数超過・不在 ID・不正フォルダー名・危険キー）を全体拒否する", () => {
    const validFolder: MapFolder = {
      id: "folder-1",
      name: "仕事",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const tooManyFolders: MapFolder[] = Array.from({ length: MAX_MAP_FOLDERS + 1 }, (_, i) => ({
      id: `folder-${i}`,
      name: `フォルダー${i}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    // mapMeta の先行件数超過（maps は 1 件なのに mapMeta が 2 件）
    expect(decodeLibraryBackup({
      ...backup,
      mapMeta: {
        "source-a": { favorite: true },
        "source-extra": { favorite: true },
      },
    }).ok).toBe(false);

    // 存在しない mapId（件数内でも拒否）
    expect(decodeLibraryBackup({
      ...backup,
      mapMeta: { "missing-map": { favorite: true } },
    }).ok).toBe(false);

    // 存在しない folderId
    expect(decodeLibraryBackup({
      ...backup,
      folders: [validFolder],
      mapMeta: { "source-a": { folderId: "missing-folder" } },
    }).ok).toBe(false);

    // 不正フォルダー名（未正規化・空・制御文字・重複）
    expect(decodeLibraryBackup({
      ...backup,
      folders: [{ ...validFolder, name: " 仕事 " }],
    }).ok).toBe(false);
    expect(decodeLibraryBackup({
      ...backup,
      folders: [{ ...validFolder, name: "" }],
    }).ok).toBe(false);
    expect(decodeLibraryBackup({
      ...backup,
      folders: [{ ...validFolder, name: "仕事\u0000" }],
    }).ok).toBe(false);
    expect(decodeLibraryBackup({
      ...backup,
      folders: [validFolder, { ...validFolder, id: "folder-2", name: "仕事" }],
    }).ok).toBe(false);

    // フォルダー上限超過
    expect(decodeLibraryBackup({
      ...backup,
      folders: tooManyFolders,
    }).ok).toBe(false);

    // null・未知キー・危険キー __proto__
    expect(decodeLibraryBackup({ ...backup, folders: null }).ok).toBe(false);
    expect(decodeLibraryBackup({ ...backup, mapMeta: null }).ok).toBe(false);
    expect(decodeLibraryBackup({
      ...backup,
      folders: [{ ...validFolder, extra: true }],
    }).ok).toBe(false);
    expect(decodeLibraryBackup({
      ...backup,
      mapMeta: { "source-a": { favorite: true, extra: 1 } },
    }).ok).toBe(false);

    const protoMapMetaRaw = `{"format":"draw-my-map-library-backup","version":1,"exportedAt":"${timestamp}","currentMapId":"source-a","maps":[${JSON.stringify(map)}],"mapMeta":{"__proto__":{"favorite":true}}}`;
    expect(parseLibraryBackupJson(protoMapMetaRaw).ok).toBe(false);
    const protoEntryRaw = `{"format":"draw-my-map-library-backup","version":1,"exportedAt":"${timestamp}","currentMapId":"source-a","maps":[${JSON.stringify(map)}],"mapMeta":{"source-a":{"favorite":true,"__proto__":{"polluted":true}}}}`;
    expect(parseLibraryBackupJson(protoEntryRaw).ok).toBe(false);
  });

  it.each([
    ["個別 JSON", emptyDocument],
    ["将来版", { ...backup, version: 2 }],
    ["別形式", { ...backup, format: "other" }],
    ["空配列", { ...backup, maps: [] }],
    ["非包含 current ID", { ...backup, currentMapId: "not-included" }],
    ["不正 current ID", { ...backup, currentMapId: "bad/id" }],
    ["重複 ID", { ...backup, maps: [map, map] }],
    ["不正 ID", { ...backup, maps: [{ ...map, id: "bad/id" }] }],
    ["空の名前", { ...backup, maps: [{ ...map, name: "" }] }],
    ["前後空白の名前", { ...backup, maps: [{ ...map, name: " 旅行 " }] }],
    ["長い名前", { ...backup, maps: [{ ...map, name: "あ".repeat(51) }] }],
    ["不正な書出日時", { ...backup, exportedAt: "2026-02-30" }],
    ["不正な作成日時", { ...backup, maps: [{ ...map, createdAt: "yesterday" }] }],
    ["不正な更新日時", { ...backup, maps: [{ ...map, updatedAt: null }] }],
    ["V1 document", { ...backup, maps: [{ ...map, document: { ...emptyDocument, version: 1 } }] }],
    ["V2 document", { ...backup, maps: [{ ...map, document: { ...emptyDocument, version: 2 } }] }],
    ["不正グラフ", { ...backup, maps: [{ ...map, document: { version: 3, layoutMode: "manual", nodes: [createTestNode({ id: 1, parentId: 2 })] } }] }],
    ["不正数値", { ...backup, maps: [{ ...map, document: { version: 3, layoutMode: "manual", nodes: [createTestNode({ id: 1, width: 0 })] } }] }],
    ["不正画像", { ...backup, maps: [{ ...map, document: { version: 3, layoutMode: "manual", nodes: [createTestNode({ id: 1, illustration: "data:image/png;base64,AAAA" })] } }] }],
  ])("%s を全体拒否する", (_name, value) => {
    expect(decodeLibraryBackup(value).ok).toBe(false);
  });

  it("1件でも不正なら有効な他のマップも返さない", () => {
    const result = decodeLibraryBackup({ ...backup, maps: [map, { ...map, id: "source-b", name: " " }] });
    expect(result.ok).toBe(false);
  });

  it("1000件は受け入れ、1001件は拒否する", () => {
    const maps = Array.from({ length: MAX_LIBRARY_BACKUP_MAPS }, (_, index) => ({ ...map, id: `map-${index}` }));
    expect(decodeLibraryBackup({ ...backup, currentMapId: "map-0", maps }).ok).toBe(true);
    expect(createLibraryBackup(maps, "map-0", timestamp).ok).toBe(true);
    expect(decodeLibraryBackup({ ...backup, currentMapId: "map-0", maps: [...maps, { ...map, id: "overflow" }] }).ok).toBe(false);
    expect(createLibraryBackup([...maps, { ...map, id: "overflow" }], "map-0", timestamp).ok).toBe(false);
  });

  it("途中 JSON と上限超過 JSON を拒否し、ちょうど 32 MiB の UTF-8 は受け入れる", () => {
    expect(parseLibraryBackupJson('{"format":').ok).toBe(false);
    const valid = JSON.stringify(backup);
    const atLimit = valid + " ".repeat(MAX_LIBRARY_BACKUP_BYTES - new Blob([valid]).size);
    expect(parseLibraryBackupJson(atLimit)).toEqual({ ok: true, value: backup });
    expect(parseLibraryBackupJson(`${atLimit} `).ok).toBe(false);
  });

  it("書出し時も 32 MiB を超える UTF-8 データを拒否する", () => {
    const oversized: LibraryBackupMap = {
      ...map,
      document: {
        version: 3,
        layoutMode: "manual",
        nodes: [createTestNode({ id: 1, label: "あ".repeat(11_184_810) })],
      },
    };
    expect(createLibraryBackup([oversized], "source-a", timestamp).ok).toBe(false);
  });
});
