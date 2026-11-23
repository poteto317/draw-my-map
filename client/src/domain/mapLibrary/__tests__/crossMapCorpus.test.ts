import {
  composeCrossMapCorpus,
  createEmptyOtherMapsCorpus,
  otherMapsCorpusKey,
  type OtherMapsCorpus,
} from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { archiveMapMeta, createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import { createTestNode } from "@/testing/createTestNode";

const emptyMeta = createEmptyMapLibraryMeta();

describe("crossMapCorpus", () => {
  describe("createEmptyOtherMapsCorpus", () => {
    it("空の readableMaps と unreadableMaps を持ち、呼び出しごとに新しい参照を返す（L-461）", () => {
      const a = createEmptyOtherMapsCorpus();
      const b = createEmptyOtherMapsCorpus();

      expect(a).toEqual({ readableMaps: [], unreadableMaps: [] });
      expect(a).not.toBe(b);
      expect(a.readableMaps).not.toBe(b.readableMaps);
      expect(a.unreadableMaps).not.toBe(b.unreadableMaps);
    });
  });

  describe("composeCrossMapCorpus", () => {
    it("現在マップを先頭に置き、後ろに他マップの readableMaps と unreadableMaps を合成する", () => {
      const currentNodes = [createTestNode({ id: 1, label: "現在のルート" })];
      const otherNodes = [createTestNode({ id: 1, label: "他マップのルート" })];
      const otherMapsCorpus: OtherMapsCorpus = {
        readableMaps: [
          {
            mapId: "map-2",
            mapName: "マップ 2",
            isCurrent: false,
            nodes: otherNodes,
          },
        ],
        unreadableMaps: [
          {
            mapId: "map-3",
            mapName: "破損マップ",
            reason: "corrupt",
          },
        ],
      };

      const corpus = composeCrossMapCorpus({
        otherMapsCorpus,
        currentMapId: "map-1",
        currentMapName: "現在のマップ",
        currentNodes,
        libraryMeta: emptyMeta,
      });

      expect(corpus).toEqual({
        readableMaps: [
          {
            mapId: "map-1",
            mapName: "現在のマップ",
            isCurrent: true,
        isArchived: false,
            nodes: currentNodes,
          },
          {
            mapId: "map-2",
            mapName: "マップ 2",
            isCurrent: false,
        isArchived: false,
            nodes: otherNodes,
          },
        ],
        unreadableMaps: [
          {
            mapId: "map-3",
            mapName: "破損マップ",
            reason: "corrupt",
          },
        ],
      });
    });

    it("otherMapsCorpus に万一 currentMapId が含まれていても現在マップと重複させない", () => {
      const currentNodes = [createTestNode({ id: 1, label: "最新" })];
      const otherMapsCorpus: OtherMapsCorpus = {
        readableMaps: [
          {
            mapId: "map-1",
            mapName: "古い状態",
            isCurrent: false,
            nodes: [createTestNode({ id: 1, label: "古い" })],
          },
          {
            mapId: "map-2",
            mapName: "他マップ",
            isCurrent: false,
            nodes: [],
          },
        ],
        unreadableMaps: [
          { mapId: "map-1", mapName: "重複", reason: "read-error" },
          { mapId: "map-3", mapName: "読込失敗", reason: "read-error" },
        ],
      };

      const corpus = composeCrossMapCorpus({
        otherMapsCorpus,
        currentMapId: "map-1",
        currentMapName: "現在",
        currentNodes,
        libraryMeta: emptyMeta,
      });

      expect(corpus.readableMaps.map((m) => [m.mapId, m.isCurrent])).toEqual([
        ["map-1", true],
        ["map-2", false],
      ]);
      expect(corpus.unreadableMaps).toEqual([
        { mapId: "map-3", mapName: "読込失敗", reason: "read-error" },
      ]);
    });

    it("アーカイブ印は libraryMeta からだけ付与する（読込結果に含まれなくても compose で刻印）", () => {
      const currentNodes = [createTestNode({ id: 1, label: "現在" })];
      const otherMapsCorpus: OtherMapsCorpus = {
        readableMaps: [
          {
            mapId: "map-2",
            mapName: "他マップ",
            isCurrent: false,
            nodes: [createTestNode({ id: 1, label: "他" })],
          },
        ],
        unreadableMaps: [],
      };
      const libraryMeta = archiveMapMeta(emptyMeta, "map-2", "2026-11-01T00:00:00.000Z");

      const corpus = composeCrossMapCorpus({
        otherMapsCorpus,
        currentMapId: "map-1",
        currentMapName: "現在",
        currentNodes,
        libraryMeta,
      });

      expect(corpus.readableMaps[0].isArchived).toBe(false);
      expect(corpus.readableMaps[1].isArchived).toBe(true);
    });
  });

  describe("otherMapsCorpusKey", () => {
    const entry = (id: string, name: string, updatedAt: string): MapIndexEntry => ({
      id,
      name,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt,
    });
    const maps = [
      entry("map-a", "A", "2026-10-03T00:00:00.000Z"),
      entry("map-b", "B", "2026-10-02T00:00:00.000Z"),
      entry("map-c", "C", "2026-10-01T00:00:00.000Z"),
    ];
    const key = otherMapsCorpusKey(maps, "map-a");

    it("現在マップの更新日時だけが変わっても（表示順の先頭へ移っても）同じキー", () => {
      const touched = [entry("map-a", "A", "2026-12-01T00:00:00.000Z"), maps[1], maps[2]];
      const older = [entry("map-a", "A", "2026-01-01T00:00:00.000Z"), maps[1], maps[2]];

      expect(otherMapsCorpusKey(touched, "map-a")).toBe(key);
      expect(otherMapsCorpusKey(older, "map-a")).toBe(key);
      expect(otherMapsCorpusKey([maps[2], maps[0], maps[1]], "map-a")).toBe(key);
    });

    it("現在マップの名前が変わっても同じキー（現在マップは合成時に currentMapName を使う）", () => {
      expect(otherMapsCorpusKey([entry("map-a", "改名", maps[0].updatedAt), maps[1], maps[2]], "map-a")).toBe(key);
    });

    it.each<[string, readonly MapIndexEntry[], string]>([
      ["他マップの名前が変わる", [maps[0], entry("map-b", "B2", maps[1].updatedAt), maps[2]], "map-a"],
      ["他マップの更新日時が変わる（本体が置き換わった）", [maps[0], entry("map-b", "B", "2026-11-01T00:00:00.000Z"), maps[2]], "map-a"],
      ["他マップが増える", [...maps, entry("map-d", "D", "2026-09-01T00:00:00.000Z")], "map-a"],
      ["他マップが減る（削除・ゴミ箱）", [maps[0], maps[1]], "map-a"],
      ["現在マップが替わる", maps, "map-b"],
    ])("%sとキーが変わる", (_name, next, currentMapId) => {
      expect(otherMapsCorpusKey(next, currentMapId)).not.toBe(key);
    });
  });
});
