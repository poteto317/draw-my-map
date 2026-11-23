import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import {
  MAX_CROSS_MAP_SEARCH_RESULTS,
  searchCrossMapCorpus,
} from "@/domain/search/crossMapSearch";
import { createTestNode } from "@/testing/createTestNode";

const JAPANESE_URL =
  "https://example.com/%E3%83%91%E3%82%B9?q=%E6%97%A5%E6%9C%AC%E8%AA%9E";

function makeCorpus(overrides: Partial<CrossMapCorpus> = {}): CrossMapCorpus {
  return {
    readableMaps: overrides.readableMaps ?? [],
    unreadableMaps: overrides.unreadableMaps ?? [],
  };
}

describe("crossMapSearch", () => {
  it("MAX_CROSS_MAP_SEARCH_RESULTS は 100 である", () => {
    expect(MAX_CROSS_MAP_SEARCH_RESULTS).toBe(100);
  });

  it("空クエリ・空白のみのクエリは 0 件を返し unreadableMaps を伝播する", () => {
    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-1",
          mapName: "現在マップ",
          isCurrent: true,
        isArchived: false,
          nodes: [createTestNode({ id: 1, label: "テスト" })],
        },
      ],
      unreadableMaps: [
        { mapId: "map-err", mapName: "壊れたマップ", reason: "corrupt" },
      ],
    });

    expect(searchCrossMapCorpus(corpus, "")).toEqual({
      matches: [],
      total: 0,
      matchedMapCount: 0,
      unreadableMaps: [
        { mapId: "map-err", mapName: "壊れたマップ", reason: "corrupt" },
      ],
    });
    expect(searchCrossMapCorpus(corpus, "  \u3000 \t ")).toEqual({
      matches: [],
      total: 0,
      matchedMapCount: 0,
      unreadableMaps: [
        { mapId: "map-err", mapName: "壊れたマップ", reason: "corrupt" },
      ],
    });
  });

  it("5 フィールド（label / note / tag / link / source）をそれぞれ検索できる", () => {
    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-1",
          mapName: "メイン",
          isCurrent: true,
        isArchived: false,
          nodes: [
            createTestNode({ id: 1, label: "アルファ計画" }),
            createTestNode({ id: 2, label: "ノード2", note: "ベータ仕様のメモ" }),
            createTestNode({ id: 3, label: "ノード3", tags: ["ガンマ方針"] }),
            createTestNode({
              id: 4,
              label: "ノード4",
              links: ["https://example.com/delta-doc"],
            }),
            createTestNode({
              id: 5,
              label: "ノード5",
              sources: [
                { title: "イプシロン入門", page: "p.42", url: "https://example.com/book" },
              ],
            }),
          ],
        },
      ],
    });

    const labelResult = searchCrossMapCorpus(corpus, "アルファ");
    expect(labelResult.matches).toEqual([
      {
        mapId: "map-1",
        mapName: "メイン",
        isCurrentMap: true,
        isMapArchived: false,
        nodeId: 1,
        label: "アルファ計画",
        parentLabel: null,
        matchedBy: "label",
      },
    ]);
    expect("snippet" in labelResult.matches[0]).toBe(false);

    expect(searchCrossMapCorpus(corpus, "ベータ").matches).toEqual([
      {
        mapId: "map-1",
        mapName: "メイン",
        isCurrentMap: true,
        isMapArchived: false,
        nodeId: 2,
        label: "ノード2",
        parentLabel: null,
        matchedBy: "note",
        snippet: "ベータ仕様のメモ",
      },
    ]);

    expect(searchCrossMapCorpus(corpus, "ガンマ").matches).toEqual([
      {
        mapId: "map-1",
        mapName: "メイン",
        isCurrentMap: true,
        isMapArchived: false,
        nodeId: 3,
        label: "ノード3",
        parentLabel: null,
        matchedBy: "tag",
        snippet: "ガンマ方針",
      },
    ]);

    expect(searchCrossMapCorpus(corpus, "delta").matches).toEqual([
      {
        mapId: "map-1",
        mapName: "メイン",
        isCurrentMap: true,
        isMapArchived: false,
        nodeId: 4,
        label: "ノード4",
        parentLabel: null,
        matchedBy: "link",
        snippet: "https://example.com/delta-doc",
      },
    ]);

    expect(searchCrossMapCorpus(corpus, "イプシロン").matches).toEqual([
      {
        mapId: "map-1",
        mapName: "メイン",
        isCurrentMap: true,
        isMapArchived: false,
        nodeId: 5,
        label: "ノード5",
        parentLabel: null,
        matchedBy: "source",
        snippet: "イプシロン入門",
      },
    ]);
    expect(searchCrossMapCorpus(corpus, "p.42").matches[0]).toMatchObject({
      nodeId: 5,
      matchedBy: "source",
      snippet: "イプシロン入門",
    });
    expect(searchCrossMapCorpus(corpus, "example.com/book").matches[0]).toMatchObject({
      nodeId: 5,
      matchedBy: "source",
      snippet: "イプシロン入門",
    });
  });

  it("5 フィールドの優先順は label > note > tag > link > source である", () => {
    const keyword = "target";
    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-1",
          mapName: "優先順テスト",
          isCurrent: true,
        isArchived: false,
          nodes: [
            createTestNode({
              id: 1,
              label: `label ${keyword}`,
              note: `note ${keyword}`,
              tags: [`tag-${keyword}`],
              links: [`https://example.com/${keyword}`],
              sources: [{ title: `source ${keyword}` }],
            }),
            createTestNode({
              id: 2,
              label: "他",
              note: `note ${keyword}`,
              tags: [`tag-${keyword}`],
              links: [`https://example.com/${keyword}`],
              sources: [{ title: `source ${keyword}` }],
            }),
            createTestNode({
              id: 3,
              label: "他",
              note: "関係ないメモ",
              tags: [`tag-${keyword}`],
              links: [`https://example.com/${keyword}`],
              sources: [{ title: `source ${keyword}` }],
            }),
            createTestNode({
              id: 4,
              label: "他",
              tags: ["別タグ"],
              links: [`https://example.com/${keyword}`],
              sources: [{ title: `source ${keyword}` }],
            }),
            createTestNode({
              id: 5,
              label: "他",
              links: ["https://example.com/other"],
              sources: [{ title: `source ${keyword}` }],
            }),
          ],
        },
      ],
    });

    const result = searchCrossMapCorpus(corpus, keyword);
    expect(result.matches.map((m) => [m.nodeId, m.matchedBy])).toEqual([
      [1, "label"],
      [2, "note"],
      [3, "tag"],
      [4, "link"],
      [5, "source"],
    ]);
  });

  it("NFKC・小文字化・前後 trim で照合し、ひらがなとカタカナは同一視しない", () => {
    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-1",
          mapName: "正規化",
          isCurrent: true,
        isArchived: false,
          nodes: [
            createTestNode({ id: 1, label: "ＡＢＣ１ガイド" }),
            createTestNode({ id: 2, label: "別", tags: ["ｶﾞｲﾄﾞ"] }),
          ],
        },
      ],
    });

    expect(searchCrossMapCorpus(corpus, "  abc1ｶﾞｲﾄﾞ　").matches.map((m) => m.nodeId)).toEqual([1]);
    expect(searchCrossMapCorpus(corpus, "ガイド").matches.map((m) => m.nodeId)).toEqual([1, 2]);
    expect(searchCrossMapCorpus(corpus, "がいど").total).toBe(0);
  });

  it("空ラベルは代替表示文言では一致せず、他フィールド一致時の表示ラベルと親ラベルは代替表示文言になる", () => {
    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-1",
          mapName: "親ラベル",
          isCurrent: true,
        isArchived: false,
          nodes: [
            createTestNode({ id: 1, parentId: null, label: "" }),
            createTestNode({ id: 2, parentId: 1, label: "", note: "ヒットするメモ" }),
            createTestNode({ id: 3, parentId: 999, label: "孤立子ノード" }),
          ],
        },
      ],
    });

    expect(searchCrossMapCorpus(corpus, "新しいノード").total).toBe(0);

    const noteHit = searchCrossMapCorpus(corpus, "ヒット");
    expect(noteHit.matches).toEqual([
      {
        mapId: "map-1",
        mapName: "親ラベル",
        isCurrentMap: true,
        isMapArchived: false,
        nodeId: 2,
        label: "新しいノード",
        parentLabel: "新しいノード",
        matchedBy: "note",
        snippet: "ヒットするメモ",
      },
    ]);

    const orphanHit = searchCrossMapCorpus(corpus, "孤立");
    expect(orphanHit.matches[0].parentLabel).toBeNull();
  });

  it("link と source.url は元 URL と decodeURI の両方で照合し、不正パーセントエンコードで例外にならない", () => {
    const brokenPercentUrl = "https://example.com/%E3%81";
    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-1",
          mapName: "URL照合",
          isCurrent: true,
        isArchived: false,
          nodes: [
            createTestNode({ id: 1, label: "リンク", links: [JAPANESE_URL] }),
            createTestNode({ id: 2, label: "壊れリンク", links: [brokenPercentUrl] }),
            createTestNode({
              id: 3,
              label: "出典URL",
              sources: [{ title: "日本語出典", url: JAPANESE_URL }],
            }),
            createTestNode({
              id: 4,
              label: "壊れ出典URL",
              sources: [{ title: "壊れ出典", url: brokenPercentUrl }],
            }),
          ],
        },
      ],
    });

    expect(searchCrossMapCorpus(corpus, "日本語").matches.map((m) => [m.nodeId, m.matchedBy, m.snippet])).toEqual([
      [1, "link", JAPANESE_URL],
      [3, "source", "日本語出典"],
    ]);
    expect(searchCrossMapCorpus(corpus, "%E3%83%91").matches.map((m) => [m.nodeId, m.matchedBy])).toEqual([
      [1, "link"],
      [3, "source"],
    ]);
    expect(searchCrossMapCorpus(corpus, "%e3%81").matches.map((m) => [m.nodeId, m.matchedBy, m.snippet])).toEqual([
      [2, "link", brokenPercentUrl],
      [4, "source", "壊れ出典"],
    ]);
  });

  describe("詳細メモのスニペット抜粋（最大 80 コードポイント）", () => {
    it.each<[string, string]>([
      ["ちょうど 80 コードポイント", `ヒット語${"あ".repeat(76)}`],
      ["サロゲートペアを含むちょうど 80 コードポイント（UTF-16 では 80 を超える）", `ヒット語${"😀".repeat(10)}${"あ".repeat(66)}`],
    ])("%sのメモは抜粋せず全文をスニペットにする", (_name, note) => {
      expect(Array.from(note)).toHaveLength(80);
      const corpus = makeCorpus({
        readableMaps: [
          { mapId: "map-1", mapName: "境界", isCurrent: true, isArchived: false, nodes: [createTestNode({ id: 1, label: "境界", note })] },
        ],
      });

      expect(searchCrossMapCorpus(corpus, "ヒット語").matches[0].snippet).toBe(note);
    });

    it.each<[string, string]>([
      ["81 コードポイント", `ヒット語${"あ".repeat(77)}`],
      ["サロゲートペアを含む 81 コードポイント", `ヒット語${"😀".repeat(10)}${"あ".repeat(67)}`],
    ])("%sのメモは先頭 79 コードポイント＋「…」に抜粋する", (_name, note) => {
      const codePoints = Array.from(note);
      expect(codePoints).toHaveLength(81);
      const corpus = makeCorpus({
        readableMaps: [
          { mapId: "map-1", mapName: "境界", isCurrent: true, isArchived: false, nodes: [createTestNode({ id: 1, label: "境界", note })] },
        ],
      });

      const snippet = searchCrossMapCorpus(corpus, "ヒット語").matches[0].snippet!;
      expect(snippet).toBe(`${codePoints.slice(0, 79).join("")}…`);
      expect(Array.from(snippet)).toHaveLength(80);
    });

    it("長いメモの先頭・中央・末尾一致で一致周辺を 80 コードポイント以内に抜粋する", () => {
      const longNoteHead = `ヒット語${"あ".repeat(120)}`;
      const longNoteMid = `${"あ".repeat(60)}ヒット語${"い".repeat(60)}`;
      const longNoteTail = `${"う".repeat(120)}ヒット語`;
      const corpus = makeCorpus({
        readableMaps: [
          {
            mapId: "map-1",
            mapName: "長文メモ",
            isCurrent: true,
        isArchived: false,
            nodes: [
              createTestNode({ id: 1, label: "先頭", note: longNoteHead }),
              createTestNode({ id: 2, label: "中央", note: longNoteMid }),
              createTestNode({ id: 3, label: "末尾", note: longNoteTail }),
            ],
          },
        ],
      });

      const result = searchCrossMapCorpus(corpus, "ヒット語");
      expect(result.matches).toHaveLength(3);

      const [head, mid, tail] = result.matches;
      expect(head.snippet).toBeDefined();
      expect(mid.snippet).toBeDefined();
      expect(tail.snippet).toBeDefined();

      for (const item of [head, mid, tail]) {
        expect(item.snippet).toContain("ヒット語");
        expect(Array.from(item.snippet!).length).toBeLessThanOrEqual(80);
      }
      expect(head.snippet!.startsWith("…")).toBe(false);
      expect(head.snippet!.endsWith("…")).toBe(true);
      expect(mid.snippet!.startsWith("…")).toBe(true);
      expect(mid.snippet!.endsWith("…")).toBe(true);
      expect(tail.snippet!.startsWith("…")).toBe(true);
      expect(tail.snippet!.endsWith("…")).toBe(false);
    });

    it("サロゲートペアや NFKC で長さが変わる半角カナ濁点を含む長いメモでも壊れず抜粋する", () => {
      const note = `${"😀".repeat(50)}ｶﾞｲﾄﾞ対象${"🚀".repeat(50)}`;
      const corpus = makeCorpus({
        readableMaps: [
          {
            mapId: "map-1",
            mapName: "絵文字メモ",
            isCurrent: true,
        isArchived: false,
            nodes: [createTestNode({ id: 1, label: "絵文字", note })],
          },
        ],
      });

      const result = searchCrossMapCorpus(corpus, "ガイド対象");
      expect(result.matches).toHaveLength(1);
      const snippet = result.matches[0].snippet!;
      expect(snippet).toContain("ｶﾞｲﾄﾞ対象");
      expect(Array.from(snippet).length).toBeLessThanOrEqual(80);
      // 単独サロゲートが残っていないことを確認
      expect(/[\uD800-\uDFFF]/.test(snippet.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))).toBe(false);
    });

    it("改行（CRLF / CR / LF）を含む短文・長文メモのスニペットで改行文字を半角スペースへ整形する", () => {
      const shortNote = "1行目\r\nヒット語\r3行目\n4行目";
      const longNote = `${"あ".repeat(45)}\r\n前文\nヒット語\r後文\r\n${"い".repeat(45)}`;
      const corpus = makeCorpus({
        readableMaps: [
          {
            mapId: "map-1",
            mapName: "改行メモ",
            isCurrent: true,
        isArchived: false,
            nodes: [
              createTestNode({ id: 1, label: "短文", note: shortNote }),
              createTestNode({ id: 2, label: "長文", note: longNote }),
            ],
          },
        ],
      });

      const result = searchCrossMapCorpus(corpus, "ヒット語");
      expect(result.matches).toHaveLength(2);

      const [shortMatch, longMatch] = result.matches;
      expect(shortMatch.snippet).toBe("1行目 ヒット語 3行目 4行目");
      expect(longMatch.snippet).toBeDefined();
      expect(longMatch.snippet!).toContain("前文 ヒット語 後文");
      expect(/[\r\n]/.test(longMatch.snippet!)).toBe(false);
      expect(Array.from(longMatch.snippet!).length).toBeLessThanOrEqual(80);
    });
  });

  it("現在マップ先頭順・ノード配列順で返し、100 件上限でも total と matchedMapCount は全件数える", () => {
    const currentNodes = Array.from({ length: 60 }, (_, i) =>
      createTestNode({ id: i + 1, label: `共通キーワード ${i + 1}` }),
    );
    const otherMap1Nodes = Array.from({ length: 50 }, (_, i) =>
      createTestNode({ id: i + 1, label: `共通キーワード B-${i + 1}` }),
    );
    const otherMap2Nodes = [
      createTestNode({ id: 1, label: "関係ないノード" }),
    ];
    const otherMap3Nodes = [
      createTestNode({ id: 1, label: "共通キーワード C-1" }),
    ];

    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-current",
          mapName: "現在マップ",
          isCurrent: true,
        isArchived: false,
          nodes: currentNodes,
        },
        {
          mapId: "map-other-1",
          mapName: "他マップ 1",
          isCurrent: false,
        isArchived: false,
          nodes: otherMap1Nodes,
        },
        {
          mapId: "map-other-2",
          mapName: "他マップ 2",
          isCurrent: false,
        isArchived: false,
          nodes: otherMap2Nodes,
        },
        {
          mapId: "map-other-3",
          mapName: "他マップ 3",
          isCurrent: false,
        isArchived: false,
          nodes: otherMap3Nodes,
        },
      ],
      unreadableMaps: [
        { mapId: "map-bad", mapName: "読込失敗マップ", reason: "read-error" },
      ],
    });

    const result = searchCrossMapCorpus(corpus, "共通キーワード");

    expect(result.matches).toHaveLength(MAX_CROSS_MAP_SEARCH_RESULTS);
    expect(result.total).toBe(111);
    expect(result.matchedMapCount).toBe(3);
    expect(result.matches[0]).toMatchObject({
      mapId: "map-current",
      isCurrentMap: true,
      isMapArchived: false,
      nodeId: 1,
    });
    expect(result.matches[59]).toMatchObject({
      mapId: "map-current",
      isCurrentMap: true,
      isMapArchived: false,
      nodeId: 60,
    });
    expect(result.matches[60]).toMatchObject({
      mapId: "map-other-1",
      isCurrentMap: false,
      isMapArchived: false,
      nodeId: 1,
    });
    expect(result.matches[99]).toMatchObject({
      mapId: "map-other-1",
      isCurrentMap: false,
      isMapArchived: false,
      nodeId: 40,
    });
    expect(result.unreadableMaps).toEqual([
      { mapId: "map-bad", mapName: "読込失敗マップ", reason: "read-error" },
    ]);

    const limited = searchCrossMapCorpus(corpus, "共通キーワード", 2);
    expect(limited.matches).toHaveLength(2);
    expect(limited.total).toBe(111);
    expect(limited.matchedMapCount).toBe(3);
  });

  it("アーカイブ済みマップの一致結果に isMapArchived: true を付与する", () => {
    const corpus = makeCorpus({
      readableMaps: [
        {
          mapId: "map-archived",
          mapName: "アーカイブ済み",
          isCurrent: false,
          isArchived: true,
          nodes: [createTestNode({ id: 1, label: "検索キーワード" })],
        },
      ],
    });
    const result = searchCrossMapCorpus(corpus, "検索");
    expect(result.matches[0]?.isMapArchived).toBe(true);
  });
});
