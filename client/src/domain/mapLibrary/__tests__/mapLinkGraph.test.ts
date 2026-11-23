import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import {
  collectBacklinks,
  collectBrokenMapLinks,
  resolveNodeMapLink,
} from "@/domain/mapLibrary/mapLinkGraph";
import { createTestNode } from "@/testing/createTestNode";

function makeSampleCorpus(): CrossMapCorpus {
  return {
    readableMaps: [
      {
        mapId: "map-current",
        mapName: "現在のマップ",
        isCurrent: true,
        isArchived: false,
        nodes: [
          createTestNode({ id: 1, label: "現在ルート" }),
          createTestNode({ id: 2, parentId: 1, label: "" }),
        ],
      },
      {
        mapId: "map-other",
        mapName: "他マップ",
        isCurrent: false,
        isArchived: false,
        nodes: [
          createTestNode({ id: 10, label: "ターゲットノード" }),
          createTestNode({ id: 11, parentId: 10, label: "" }),
        ],
      },
    ],
    unreadableMaps: [
      { mapId: "map-corrupt", mapName: "破損マップ", reason: "corrupt" },
      { mapId: "map-read-err", mapName: "読込エラーマップ", reason: "read-error" },
    ],
  };
}

describe("mapLinkGraph", () => {
  describe("resolveNodeMapLink", () => {
    it("マップ全体リンクが readableMaps に存在すれば valid（targetNodeLabel なし）を返す", () => {
      const corpus = makeSampleCorpus();
      const link = { targetMapId: "map-other" };

      const resolved = resolveNodeMapLink(link, corpus);
      expect(resolved).toEqual({
        status: "valid",
        link,
        targetMapName: "他マップ",
      });
      expect("targetNodeLabel" in resolved).toBe(false);
    });

    it("特定ノードリンクが readableMaps に存在すれば valid と targetNodeLabel を返す（空ラベルは代替文言）", () => {
      const corpus = makeSampleCorpus();

      expect(
        resolveNodeMapLink({ targetMapId: "map-other", targetNodeId: 10 }, corpus),
      ).toEqual({
        status: "valid",
        link: { targetMapId: "map-other", targetNodeId: 10 },
        targetMapName: "他マップ",
        targetNodeLabel: "ターゲットノード",
      });

      expect(
        resolveNodeMapLink({ targetMapId: "map-other", targetNodeId: 11 }, corpus),
      ).toEqual({
        status: "valid",
        link: { targetMapId: "map-other", targetNodeId: 11 },
        targetMapName: "他マップ",
        targetNodeLabel: "新しいノード",
      });
    });

    it("マップは存在するが対象ノードが存在しないときは missing-node を返す", () => {
      const corpus = makeSampleCorpus();
      const link = { targetMapId: "map-other", targetNodeId: 999 };

      expect(resolveNodeMapLink(link, corpus)).toEqual({
        status: "missing-node",
        link,
        targetMapName: "他マップ",
      });
    });

    it("unreadableMaps に含まれるマップへのリンクは targetNodeId の有無を問わず unreadable-map を返す（L-002）", () => {
      const corpus = makeSampleCorpus();

      expect(
        resolveNodeMapLink({ targetMapId: "map-corrupt" }, corpus),
      ).toEqual({
        status: "unreadable-map",
        link: { targetMapId: "map-corrupt" },
        targetMapName: "破損マップ",
      });

      expect(
        resolveNodeMapLink(
          { targetMapId: "map-read-err", targetNodeId: 1 },
          corpus,
        ),
      ).toEqual({
        status: "unreadable-map",
        link: { targetMapId: "map-read-err", targetNodeId: 1 },
        targetMapName: "読込エラーマップ",
      });
    });

    it("readableMaps にも unreadableMaps にもないマップは missing-map を返す", () => {
      const corpus = makeSampleCorpus();
      const link = { targetMapId: "map-deleted", targetNodeId: 1 };

      expect(resolveNodeMapLink(link, corpus)).toEqual({
        status: "missing-map",
        link,
      });
    });

    it("保護モードでは他マップへのリンクを missing-map ではなく protected-unavailable と判定し、現在マップ内は通常解決する（L-002）", () => {
      const protectedCorpus: CrossMapCorpus = {
        readableMaps: [
          {
            mapId: "map-current",
            mapName: "現在のマップ",
            isCurrent: true,
        isArchived: false,
            nodes: [createTestNode({ id: 1, label: "ルート" })],
          },
        ],
        unreadableMaps: [],
      };

      const otherMapLink = { targetMapId: "map-other" };
      const otherNodeLink = { targetMapId: "map-other", targetNodeId: 5 };
      expect(
        resolveNodeMapLink(otherMapLink, protectedCorpus, {
          storageMode: "protected",
          currentMapId: "map-current",
        }),
      ).toEqual({
        status: "protected-unavailable",
        link: otherMapLink,
      });
      expect(
        resolveNodeMapLink(otherNodeLink, protectedCorpus, {
          storageMode: "protected",
          currentMapId: "map-current",
        }),
      ).toEqual({
        status: "protected-unavailable",
        link: otherNodeLink,
      });

      // 現在マップ内リンクは保護モードでも通常どおり valid / missing-node 解決する
      expect(
        resolveNodeMapLink(
          { targetMapId: "map-current", targetNodeId: 1 },
          protectedCorpus,
          { storageMode: "protected", currentMapId: "map-current" },
        ),
      ).toEqual({
        status: "valid",
        link: { targetMapId: "map-current", targetNodeId: 1 },
        targetMapName: "現在のマップ",
        targetNodeLabel: "ルート",
      });
      expect(
        resolveNodeMapLink(
          { targetMapId: "map-current", targetNodeId: 99 },
          protectedCorpus,
          { storageMode: "protected", currentMapId: "map-current" },
        ),
      ).toEqual({
        status: "missing-node",
        link: { targetMapId: "map-current", targetNodeId: 99 },
        targetMapName: "現在のマップ",
      });
    });
  });

  describe("collectBacklinks", () => {
    it("node 直接リンクを先・map 全体リンクを後に並べ、同一 (sourceMapId, sourceNodeId, matchScope) を一意化する", () => {
      const corpus: CrossMapCorpus = {
        readableMaps: [
          {
            mapId: "map-current",
            mapName: "現在マップ",
            isCurrent: true,
        isArchived: false,
            nodes: [
              createTestNode({
                id: 1,
                label: "対象ノード",
                mapLinks: [{ targetMapId: "map-current" }],
              }),
              createTestNode({
                id: 2,
                label: "両方リンクするノード",
                mapLinks: [
                  { targetMapId: "map-current" },
                  { targetMapId: "map-current", targetNodeId: 1 },
                  // 重複リンクがあっても 1 件に一意化される
                  { targetMapId: "map-current", targetNodeId: 1 },
                  { targetMapId: "map-current" },
                  // 別ノードへのリンクは含まれない
                  { targetMapId: "map-current", targetNodeId: 99 },
                ],
              }),
            ],
          },
          {
            mapId: "map-other",
            mapName: "他マップ",
            isCurrent: false,
        isArchived: false,
            nodes: [
              createTestNode({
                id: 20,
                label: "",
                mapLinks: [{ targetMapId: "map-current", targetNodeId: 1 }],
              }),
              createTestNode({
                id: 21,
                label: "他マップからマップ全体",
                mapLinks: [
                  { targetMapId: "map-current" },
                  { targetMapId: "map-unrelated", targetNodeId: 1 },
                ],
              }),
            ],
          },
        ],
        unreadableMaps: [
          { mapId: "map-err", mapName: "壊れマップ", reason: "corrupt" },
        ],
      };

      const result = collectBacklinks(corpus, "map-current", 1);

      expect(result).toEqual({
        items: [
          {
            sourceMapId: "map-current",
            sourceMapName: "現在マップ",
            isCurrentMap: true,
            sourceNodeId: 2,
            sourceNodeLabel: "両方リンクするノード",
            matchScope: "node",
          },
          {
            sourceMapId: "map-other",
            sourceMapName: "他マップ",
            isCurrentMap: false,
            sourceNodeId: 20,
            sourceNodeLabel: "新しいノード",
            matchScope: "node",
          },
          {
            sourceMapId: "map-current",
            sourceMapName: "現在マップ",
            isCurrentMap: true,
            sourceNodeId: 1,
            sourceNodeLabel: "対象ノード",
            matchScope: "map",
          },
          {
            sourceMapId: "map-current",
            sourceMapName: "現在マップ",
            isCurrentMap: true,
            sourceNodeId: 2,
            sourceNodeLabel: "両方リンクするノード",
            matchScope: "map",
          },
          {
            sourceMapId: "map-other",
            sourceMapName: "他マップ",
            isCurrentMap: false,
            sourceNodeId: 21,
            sourceNodeLabel: "他マップからマップ全体",
            matchScope: "map",
          },
        ],
        unreadableMaps: [
          { mapId: "map-err", mapName: "壊れマップ", reason: "corrupt" },
        ],
      });
    });
  });

  describe("collectBacklinks（同じマップの別ノードだけを指すリンク）", () => {
    it("同じマップの別ノードだけを指すリンクを持つノードは、対象ノードの被リンクにもマップ全体の被リンクにも出ない", () => {
      const corpus: CrossMapCorpus = {
        readableMaps: [
          {
            mapId: "map-current",
            mapName: "現在マップ",
            isCurrent: true,
        isArchived: false,
            nodes: [
              createTestNode({ id: 1, label: "対象ノード" }),
              createTestNode({
                id: 2,
                label: "別ノードだけを指すノード",
                mapLinks: [{ targetMapId: "map-current", targetNodeId: 99 }],
              }),
            ],
          },
          {
            mapId: "map-other",
            mapName: "他マップ",
            isCurrent: false,
        isArchived: false,
            nodes: [
              createTestNode({
                id: 20,
                label: "他マップから別ノードだけを指すノード",
                mapLinks: [
                  { targetMapId: "map-current", targetNodeId: 2 },
                  { targetMapId: "map-current", targetNodeId: 99 },
                ],
              }),
              createTestNode({
                id: 21,
                label: "対象ノードを指すノード",
                mapLinks: [{ targetMapId: "map-current", targetNodeId: 1 }],
              }),
            ],
          },
        ],
        unreadableMaps: [],
      };

      const result = collectBacklinks(corpus, "map-current", 1);

      expect(result.items).toEqual([
        {
          sourceMapId: "map-other",
          sourceMapName: "他マップ",
          isCurrentMap: false,
          sourceNodeId: 21,
          sourceNodeLabel: "対象ノードを指すノード",
          matchScope: "node",
        },
      ]);
      expect(result.items.some((item) => item.sourceNodeId === 2 || item.sourceNodeId === 20)).toBe(false);
      expect(result.items.filter((item) => item.matchScope === "map")).toEqual([]);
    });
  });

  describe("collectBrokenMapLinks", () => {
    it("missing-map / missing-node / unreadable-map のみを値ベース link 付きで収集し、valid を除外する（L-035）", () => {
      const corpus: CrossMapCorpus = {
        readableMaps: [
          {
            mapId: "map-current",
            mapName: "現在マップ",
            isCurrent: true,
        isArchived: false,
            nodes: [
              createTestNode({
                id: 1,
                label: "現在ノード",
                mapLinks: [
                  { targetMapId: "map-other" },
                  { targetMapId: "map-other", targetNodeId: 10 },
                  { targetMapId: "map-deleted" },
                  { targetMapId: "map-other", targetNodeId: 999 },
                ],
              }),
            ],
          },
          {
            mapId: "map-other",
            mapName: "他マップ",
            isCurrent: false,
        isArchived: false,
            nodes: [
              createTestNode({
                id: 10,
                label: "",
                mapLinks: [
                  { targetMapId: "map-corrupt", targetNodeId: 1 },
                  { targetMapId: "map-current", targetNodeId: 1 },
                ],
              }),
            ],
          },
        ],
        unreadableMaps: [
          { mapId: "map-corrupt", mapName: "破損マップ", reason: "corrupt" },
        ],
      };

      const result = collectBrokenMapLinks(corpus);

      expect(result).toEqual({
        items: [
          {
            sourceMapId: "map-current",
            sourceMapName: "現在マップ",
            isCurrentMap: true,
            sourceNodeId: 1,
            sourceNodeLabel: "現在ノード",
            link: { targetMapId: "map-deleted" },
            status: "missing-map",
          },
          {
            sourceMapId: "map-current",
            sourceMapName: "現在マップ",
            isCurrentMap: true,
            sourceNodeId: 1,
            sourceNodeLabel: "現在ノード",
            link: { targetMapId: "map-other", targetNodeId: 999 },
            status: "missing-node",
            targetMapName: "他マップ",
          },
          {
            sourceMapId: "map-other",
            sourceMapName: "他マップ",
            isCurrentMap: false,
            sourceNodeId: 10,
            sourceNodeLabel: "新しいノード",
            link: { targetMapId: "map-corrupt", targetNodeId: 1 },
            status: "unreadable-map",
            targetMapName: "破損マップ",
          },
        ],
        unreadableMaps: [
          { mapId: "map-corrupt", mapName: "破損マップ", reason: "corrupt" },
        ],
      });
      // missing-map は targetMapName キーを持たず、全項目に linkIndex は存在しない（L-035）
      expect("targetMapName" in result.items[0]).toBe(false);
      for (const item of result.items) {
        expect("linkIndex" in item).toBe(false);
      }
    });
  });
});
