import { NODE_LINK_MAX_LENGTH } from "@/domain/nodes/nodeLink";
import {
  NODE_SOURCES_MAX_COUNT,
  NODE_SOURCE_INPUT_MAX_LENGTH,
  NODE_SOURCE_PAGE_MAX_LENGTH,
  NODE_SOURCE_TITLE_MAX_LENGTH,
} from "@/domain/nodes/nodeSource";
import { normalizeMapDocumentNodeSources } from "@/domain/persistence/mapDocumentNodeSources";

const ERROR =
  "node[2].sourcesは、タイトル（200文字以内）・ページ（80文字以内）・http/https の URL からなる出典の配列（最大10件）である必要があります。";
const BASE = "https://example.com/";

function source(
  title: string,
  page?: string,
  url?: string,
): { title: string; page?: string; url?: string } {
  return {
    title,
    ...(page !== undefined ? { page } : {}),
    ...(url !== undefined ? { url } : {}),
  };
}

function sourcesOf(count: number): ReturnType<typeof source>[] {
  return Array.from({ length: count }, (_, index) => source(`title${index}`));
}

describe("normalizeMapDocumentNodeSources", () => {
  it.each([1, 2] as const)("V%d では sources を無視して undefined を返す（不正な値でも失敗にしない）", (version) => {
    expect(normalizeMapDocumentNodeSources([source("設計")], 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeSources("設計", 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で undefined なら undefined", () => {
    expect(normalizeMapDocumentNodeSources(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の各要素を正規化し、順を保つ（タイトル・ページの空白まとめ、URL は URL.href）", () => {
    expect(
      normalizeMapDocumentNodeSources(
        [source(" 設計 入門 ", " 12 ", "https://Example.com"), source("別冊", undefined, " https://example.com/a b ")],
        0,
        3,
      ),
    ).toEqual({
      ok: true,
      value: [
        { title: "設計 入門", page: "12", url: "https://example.com/" },
        { title: "別冊", url: "https://example.com/a%20b" },
      ],
    });
  });

  it("空の page / url はキーごと外す", () => {
    expect(normalizeMapDocumentNodeSources([source("設計", "", "")], 0, 3)).toEqual({
      ok: true,
      value: [{ title: "設計" }],
    });
  });

  it("同じ出典とみなす要素は、後のものを捨てる（最初を残す）", () => {
    expect(
      normalizeMapDocumentNodeSources(
        [source("Python", "1"), source("python", "1"), source("設計")],
        0,
        3,
      ),
    ).toEqual({
      ok: true,
      value: [source("Python", "1"), source("設計")],
    });
  });

  it("空の配列は undefined（項目ごと持たない）", () => {
    expect(normalizeMapDocumentNodeSources([], 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("ちょうど 10 件、ちょうど上限のタイトル・ページは受け付ける", () => {
    const maxTitle = "a".repeat(NODE_SOURCE_TITLE_MAX_LENGTH);
    const maxPage = "b".repeat(NODE_SOURCE_PAGE_MAX_LENGTH);

    expect(normalizeMapDocumentNodeSources(sourcesOf(NODE_SOURCES_MAX_COUNT), 0, 3)).toEqual({
      ok: true,
      value: sourcesOf(NODE_SOURCES_MAX_COUNT),
    });
    expect(normalizeMapDocumentNodeSources([source(maxTitle, maxPage)], 0, 3)).toEqual({
      ok: true,
      value: [source(maxTitle, maxPage)],
    });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["文字列", "設計"],
    ["オブジェクト", { 0: source("設計") }],
    ["数値の要素", [1]],
    ["null の要素", [null]],
    ["配列の要素", [[source("設計")]]],
    ["title 欠落", [{ page: "1" }]],
    ["未知キー", [{ title: "設計", author: "山田" }]],
    ["title が数値", [{ title: 1 }]],
    ["page が null", [{ title: "設計", page: null }]],
    ["url が数値", [{ title: "設計", url: 1 }]],
    ["空 title", [source("")]],
    ["空白だけの title", [source("   ")]],
    ["制御文字を含む title", [source("a\u0000b")]],
    ["javascript: の url", [source("設計", undefined, "javascript:alert(1)")]],
    ["資格情報つきの url", [source("設計", undefined, "https://user:pass@example.com/")]],
    ["201 文字の title", [source("a".repeat(NODE_SOURCE_TITLE_MAX_LENGTH + 1))]],
    ["81 文字の page", [source("設計", "b".repeat(NODE_SOURCE_PAGE_MAX_LENGTH + 1))]],
    ["11 件", sourcesOf(NODE_SOURCES_MAX_COUNT + 1)],
    ["正しい要素の後ろに不正な要素", [source("設計"), source("a\u0000b")]],
  ])("V3 で不正な sources（%s）は失敗", (_name, sources) => {
    expect(normalizeMapDocumentNodeSources(sources, 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("11 件は、同じ出典とみなす要素を除けば 10 件以下でも失敗（件数は正規化より先に判定する。L-443）", () => {
    expect(
      normalizeMapDocumentNodeSources([...sourcesOf(NODE_SOURCES_MAX_COUNT), source("TITLE0")], 2, 3),
    ).toEqual({ ok: false, error: ERROR });
  });

  it("title / page の長さは前後の空白を削る前の length で、正規化より先に判定する（L-443）", () => {
    expect(
      normalizeMapDocumentNodeSources([source(`${" ".repeat(NODE_SOURCE_INPUT_MAX_LENGTH)}a`)], 2, 3),
    ).toEqual({ ok: false, error: ERROR });
    expect(
      normalizeMapDocumentNodeSources([source(`${" ".repeat(NODE_SOURCE_INPUT_MAX_LENGTH - 1)}a`)], 2, 3),
    ).toEqual({ ok: true, value: [source("a")] });
    expect(
      normalizeMapDocumentNodeSources(
        [source("設計", `${" ".repeat(NODE_SOURCE_INPUT_MAX_LENGTH)}1`)],
        2,
        3,
      ),
    ).toEqual({ ok: false, error: ERROR });
  });

  it("url の長さは前後の空白を削る前の length で、解析より先に判定する（L-443）", () => {
    const max = `${BASE}${"a".repeat(NODE_LINK_MAX_LENGTH - BASE.length)}`;

    expect(normalizeMapDocumentNodeSources([source("設計", undefined, `${max} `)], 2, 3)).toEqual({
      ok: false,
      error: ERROR,
    });
  });
});
