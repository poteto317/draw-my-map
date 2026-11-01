import { readBranchMoveIndex, transferStoredBranch } from "../mapBranchTransfer";
import { createMapDocument, serializeMapDocument, parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { createRecordingStorage, seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import { createTestNode } from "@/testing/createTestNode";
import { mapBodyKey, MAP_INDEX_STORAGE_KEY } from "../mapLibraryStorage";

const now = new Date("2026-10-31T00:00:00.000Z");
const source = serializeMapDocument(createMapDocument([
  createTestNode({ id: 1, parentId: null, label: "残す" }),
  createTestNode({ id: 2, parentId: 1, label: "枝" }),
  createTestNode({ id: 3, parentId: 2, label: "孫", height: 116, importance: "high", illustration: createJpegDataUrl(128, 128) }),
], "manual"));
function setup(target: string | null = null) {
  const recording = createRecordingStorage();
  const index = seedMapLibrary(recording.storage, [{ id: "a", json: source }, { id: "b", json: target }]);
  recording.operations.length = 0;
  return { ...recording, index };
}

describe("readBranchMoveIndex", () => {
  it("補正の要らないインデックスを原文とともに返す", () => {
    const { storage, index, entries } = setup();
    expect(readBranchMoveIndex(storage)).toEqual({ index, raw: entries()[MAP_INDEX_STORAGE_KEY] });
  });

  it("インデックスが無ければ null", () => {
    const { storage } = createRecordingStorage();
    expect(readBranchMoveIndex(storage)).toBeNull();
  });

  it("壊れたインデックスは null", () => {
    const { storage } = createRecordingStorage({ initial: { [MAP_INDEX_STORAGE_KEY]: "{broken" } });
    expect(readBranchMoveIndex(storage)).toBeNull();
  });

  it("補正が必要なインデックスも補正後の値と原文を返し、書き直さない", () => {
    const { storage, index, operations } = setup();
    const raw = JSON.stringify({ ...index, legacyCleanupPending: undefined });
    storage.setItem(MAP_INDEX_STORAGE_KEY, raw);
    operations.length = 0;
    expect(readBranchMoveIndex(storage)).toEqual({ index, raw });
    expect(operations).toEqual([]);
  });

  it("読み取りの例外は null", () => {
    const { storage } = createRecordingStorage({ failGetItem: true });
    expect(readBranchMoveIndex(storage)).toBeNull();
  });
});

describe("transferStoredBranch", () => {
  it("未作成本体を空として扱い、枝の全子孫を移し両更新日時とcurrentMapIdを更新する", () => {
    const { storage, index } = setup();
    const result = transferStoredBranch(storage, index, "a", "b", 2, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.index.currentMapId).toBe("b");
    expect(result.index.maps.map(m => m.updatedAt)).toEqual([now.toISOString(), now.toISOString()]);
    const remaining = parseMapDocumentJson(storage.getItem(mapBodyKey("a"))!);
    const target = parseMapDocumentJson(storage.getItem(mapBodyKey("b"))!);
    expect(remaining.ok && remaining.value.nodes.map(n => n.label)).toEqual(["残す"]);
    expect(target.ok && target.value.nodes.map(n => n.label)).toEqual(["枝", "孫"]);
    expect(target.ok && target.value.nodes[1]).toMatchObject({ importance: "high", illustration: createJpegDataUrl(128, 128), width: 100, height: 116 });
    expect(target.ok && target.value.nodes[1].parentId).toBe(target.ok && target.value.nodes[0].id);
    expect(Object.keys(result)).toEqual(["ok", "index"]);
    expect(target.ok && target.value.layoutMode).toBe("manual");
  });

  it("既存の移動先ノードとlayoutを保ち、衝突IDを再採番する", () => {
    const targetJson = serializeMapDocument(createMapDocument([
      createTestNode({ id: 2, parentId: null, label: "移動先の枝" }),
    ], "auto"));
    const { storage, index } = setup(targetJson);
    const result = transferStoredBranch(storage, index, "a", "b", 2, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = parseMapDocumentJson(storage.getItem(mapBodyKey("b"))!);
    const remaining = parseMapDocumentJson(storage.getItem(mapBodyKey("a"))!);
    expect(target.ok && target.value.layoutMode).toBe("auto");
    expect(remaining.ok && remaining.value.layoutMode).toBe("manual");
    expect(target.ok && target.value.nodes.map(n => n.label)).toEqual(["移動先の枝", "枝", "孫"]);
    expect(target.ok && new Set(target.value.nodes.map(n => n.id)).size).toBe(3);
    expect(target.ok && target.value.nodes[1].id).not.toBe(2);
  });

  it("補正が要るインデックスでも移動でき、補正済みの内容を書く", () => {
    const { storage, index } = setup();
    storage.setItem(MAP_INDEX_STORAGE_KEY, JSON.stringify({ ...index, legacyCleanupPending: undefined }));
    expect(transferStoredBranch(storage, index, "a", "b", 2, now).ok).toBe(true);
    expect(JSON.parse(storage.getItem(MAP_INDEX_STORAGE_KEY)!).legacyCleanupPending).toBe(false);
  });

  it("補正が要るインデックスの移動が失敗したら、原文へ戻す", () => {
    const index = seedMapLibrary(createRecordingStorage().storage, [{ id: "a", json: null }, { id: "b", json: null }]);
    const raw = JSON.stringify({ ...index, legacyCleanupPending: undefined });
    const { storage, operations, entries } = createRecordingStorage({
      initial: { [mapBodyKey("a")]: source, [MAP_INDEX_STORAGE_KEY]: raw },
      failSetItem: (key, value) => key === mapBodyKey("a") && value !== source,
    });
    expect(transferStoredBranch(storage, index, "a", "b", 2, now)).toMatchObject({ ok: false, recoveryRequired: false });
    expect(entries()).toEqual({ [mapBodyKey("a")]: source, [MAP_INDEX_STORAGE_KEY]: raw });
    expect(operations.length).toBeGreaterThan(0);
  });

  it.each([null, "{broken"])("移動元本体がないか破損なら書かない: %s", raw => {
    const { storage, index, operations } = setup();
    if (raw === null) storage.removeItem(mapBodyKey("a"));
    else storage.setItem(mapBodyKey("a"), raw);
    operations.length = 0;
    expect(transferStoredBranch(storage, index, "a", "b", 2, now).ok).toBe(false);
    expect(operations).toEqual([]);
  });

  it.each(["{broken", '{"version":999,"nodes":[]}'])("壊れた移動先 %s は空にせず無変更", target => {
    const { storage, index, entries, operations } = setup(target);
    const before = entries();
    expect(transferStoredBranch(storage, index, "a", "b", 2, now)).toMatchObject({ ok: false, recoveryRequired: false });
    expect(entries()).toEqual(before);
    expect(operations).toEqual([]);
  });

  it.each([["a", 2], ["missing", 2], ["b", 999]] as const)("同一・不存在・対象消失を拒否: %s %s", (target, root) => {
    const { storage, index, operations } = setup();
    expect(transferStoredBranch(storage, index, "a", target, root, now).ok).toBe(false);
    expect(operations).toEqual([]);
  });

  it("移動先の読み取り失敗では書かない", () => {
    const { storage, index, operations } = setup();
    const get = storage.getItem.bind(storage);
    storage.getItem = key => { if (key === mapBodyKey("b")) throw new Error("read failed"); return get(key); };
    expect(transferStoredBranch(storage, index, "a", "b", 2, now).ok).toBe(false);
    expect(operations).toEqual([]);
  });

  it("保存済みindexが変わっていれば古いindexで上書きしない", () => {
    const { storage, index, operations, entries } = setup();
    storage.setItem(MAP_INDEX_STORAGE_KEY, JSON.stringify({ ...index, maps: index.maps.slice(0, 1) }));
    operations.length = 0;
    const before = entries();
    expect(transferStoredBranch(storage, index, "a", "b", 2, now).ok).toBe(false);
    expect(entries()).toEqual(before);
    expect(operations).toEqual([]);
  });
});
