import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { readOtherMapsCorpus } from "@/services/persistence/mapLibraryCorpusReader";
import { mapBodyKey, type MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import { createTestNode } from "@/testing/createTestNode";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

const T1 = "2026-11-01T00:00:00.000Z";
const T2 = "2026-11-02T00:00:00.000Z";
const T3 = "2026-11-03T00:00:00.000Z";

function makeEntry(
  id: string,
  name: string,
  updatedAt = T1,
  createdAt = T1,
): MapIndexEntry {
  return { id, name, createdAt, updatedAt };
}

describe("mapLibraryCorpusReader", () => {
  it("現在マップを除外し、他マップを表示順（更新日時降順）で読み取る", () => {
    const nodeA = createTestNode({ id: 1, label: "マップAのノード" });
    const nodeB = createTestNode({
      id: 1,
      label: "マップBのノード",
      mapLinks: [{ targetMapId: "map-current" }],
    });
    const { storage } = createRecordingStorage({
      initial: {
        [mapBodyKey("map-current")]: "{broken-should-not-be-read",
        [mapBodyKey("map-a")]: serializeMapDocument(
          createMapDocument([nodeA], "manual"),
        ),
        [mapBodyKey("map-b")]: serializeMapDocument(
          createMapDocument([nodeB], "auto"),
        ),
      },
    });

    const maps: MapIndexEntry[] = [
      makeEntry("map-a", "古いマップ", T1),
      makeEntry("map-current", "現在マップ", T3),
      makeEntry("map-b", "新しいマップ", T2),
    ];

    const corpus = readOtherMapsCorpus({
      maps,
      currentMapId: "map-current",
      storage,
    });

    expect(corpus.unreadableMaps).toEqual([]);
    expect(corpus.readableMaps).toEqual([
      {
        mapId: "map-b",
        mapName: "新しいマップ",
        isCurrent: false,
        nodes: [nodeB],
      },
      {
        mapId: "map-a",
        mapName: "古いマップ",
        isCurrent: false,
        nodes: [nodeA],
      },
    ]);
  });

  it("本体未保存（null）の他マップは nodes: [] の正常な空マップとして読み取る", () => {
    const { storage } = createRecordingStorage();
    const maps: MapIndexEntry[] = [
      makeEntry("map-current", "現在マップ", T2),
      makeEntry("map-empty", "未保存の新規マップ", T1),
    ];

    const corpus = readOtherMapsCorpus({
      maps,
      currentMapId: "map-current",
      storage,
    });

    expect(corpus).toEqual({
      readableMaps: [
        {
          mapId: "map-empty",
          mapName: "未保存の新規マップ",
          isCurrent: false,
          nodes: [],
        },
      ],
      unreadableMaps: [],
    });
  });

  it("readMapBody が例外で失敗したマップは unreadableMaps に reason: read-error として記録する（L-002）", () => {
    const nodeOk = createTestNode({ id: 1, label: "正常ノード" });
    const base = createRecordingStorage({
      initial: {
        [mapBodyKey("map-ok")]: serializeMapDocument(
          createMapDocument([nodeOk], "manual"),
        ),
      },
    });
    const failingKey = mapBodyKey("map-fail");
    const storage: MapLibraryStorage = {
      get length() {
        return base.storage.length;
      },
      key: (i) => base.storage.key(i),
      getItem: (key) => {
        if (key === failingKey) {
          throw new DOMException("blocked", "SecurityError");
        }
        return base.storage.getItem(key);
      },
      setItem: (key, value) => base.storage.setItem(key, value),
      removeItem: (key) => base.storage.removeItem(key),
    };

    const corpus = readOtherMapsCorpus({
      maps: [
        makeEntry("map-current", "現在", T3),
        makeEntry("map-fail", "読込不可マップ", T2),
        makeEntry("map-ok", "正常マップ", T1),
      ],
      currentMapId: "map-current",
      storage,
    });

    expect(corpus.readableMaps).toEqual([
      {
        mapId: "map-ok",
        mapName: "正常マップ",
        isCurrent: false,
        nodes: [nodeOk],
      },
    ]);
    expect(corpus.unreadableMaps).toEqual([
      {
        mapId: "map-fail",
        mapName: "読込不可マップ",
        reason: "read-error",
      },
    ]);
  });

  it("parseMapDocumentJson が失敗したマップは unreadableMaps に reason: corrupt として記録する（L-002）", () => {
    const { storage } = createRecordingStorage({
      initial: {
        [mapBodyKey("map-broken-json")]: "{not-json",
        [mapBodyKey("map-invalid-schema")]: JSON.stringify({
          version: 99,
          layoutMode: "manual",
          nodes: [],
        }),
      },
    });

    const corpus = readOtherMapsCorpus({
      maps: [
        makeEntry("map-current", "現在", T3),
        makeEntry("map-broken-json", "JSON破損マップ", T2),
        makeEntry("map-invalid-schema", "形式不正マップ", T1),
      ],
      currentMapId: "map-current",
      storage,
    });

    expect(corpus.readableMaps).toEqual([]);
    expect(corpus.unreadableMaps).toEqual([
      {
        mapId: "map-broken-json",
        mapName: "JSON破損マップ",
        reason: "corrupt",
      },
      {
        mapId: "map-invalid-schema",
        mapName: "形式不正マップ",
        reason: "corrupt",
      },
    ]);
  });

  it("V1 / V2 / V3 すべてのマップ保存形式を読み込める", () => {
    const v1Json = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [
        {
          id: 1,
          parentId: null,
          x: 0,
          y: 0,
          width: 100,
          height: 60,
          label: "V1ノード",
          importance: "medium",
        },
      ],
    });
    const v2Json = JSON.stringify({
      version: 2,
      layoutMode: "auto",
      nodes: [
        {
          id: 1,
          parentId: null,
          x: 10,
          y: 20,
          width: 120,
          height: 60,
          label: "V2ノード",
          importance: "high",
        },
      ],
    });
    const v3Node = createTestNode({
      id: 1,
      label: "V3ノード",
      note: "詳細メモ",
      tags: ["設計"],
      links: ["https://example.com/v3"],
      sources: [{ title: "出典書", page: "p.10" }],
      mapLinks: [{ targetMapId: "map-v1", targetNodeId: 1 }],
    });
    const v3Json = serializeMapDocument(createMapDocument([v3Node], "manual"));

    const { storage } = createRecordingStorage({
      initial: {
        [mapBodyKey("map-v1")]: v1Json,
        [mapBodyKey("map-v2")]: v2Json,
        [mapBodyKey("map-v3")]: v3Json,
      },
    });

    const corpus = readOtherMapsCorpus({
      maps: [
        makeEntry("map-current", "現在", T3),
        makeEntry("map-v3", "V3マップ", T3),
        makeEntry("map-v2", "V2マップ", T2),
        makeEntry("map-v1", "V1マップ", T1),
      ],
      currentMapId: "map-current",
      storage,
    });

    expect(corpus.unreadableMaps).toEqual([]);
    expect(corpus.readableMaps.map((m) => [m.mapId, m.nodes[0].label])).toEqual([
      ["map-v3", "V3ノード"],
      ["map-v2", "V2ノード"],
      ["map-v1", "V1ノード"],
    ]);
    expect(corpus.readableMaps[0].nodes[0]).toEqual(v3Node);
  });
});
