import {
  MAX_LIBRARY_BACKUP_BYTES,
  MAX_LIBRARY_BACKUP_MAPS,
  createLibraryBackup,
  decodeLibraryBackup,
  parseLibraryBackupJson,
  type LibraryBackupMap,
} from "@/domain/mapLibrary/libraryBackupCodec";
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

  it("ノードの illustration を round-trip し、余分なキーを除く", () => {
    const illustration = createJpegDataUrl(128, 128);
    const node = createTestNode({ id: 1, parentId: null, height: 116, illustration });
    const source = {
      ...backup,
      ignored: "outer",
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
