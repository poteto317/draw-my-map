import { NODE_LINKS_MAX_COUNT, NODE_LINK_MAX_LENGTH } from "@/domain/nodes/nodeLink";
import { normalizeMapDocumentNodeLinks } from "@/domain/persistence/mapDocumentNodeLinks";

const ERROR = "node[2].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。";
const BASE = "https://example.com/";
const A = "https://example.com/a";

function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${BASE}link${index}`);
}

describe("normalizeMapDocumentNodeLinks", () => {
  it.each([1, 2] as const)("V%d では links を無視して undefined を返す（不正な値でも失敗にしない）", (version) => {
    expect(normalizeMapDocumentNodeLinks([A], 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeLinks("javascript:alert(1)", 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で undefined なら undefined", () => {
    expect(normalizeMapDocumentNodeLinks(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の各要素を正規化した値（URL.href）にし、順を保つ", () => {
    expect(normalizeMapDocumentNodeLinks(["https://Example.com", " https://example.com/a b "], 0, 3))
      .toEqual({ ok: true, value: ["https://example.com/", "https://example.com/a%20b"] });
  });

  it("正規化すると同じになる要素は、後のものを捨てる", () => {
    expect(normalizeMapDocumentNodeLinks([A, "HTTPS://EXAMPLE.COM/a", "https://example.org/"], 0, 3))
      .toEqual({ ok: true, value: [A, "https://example.org/"] });
  });

  it("空の配列は undefined（項目ごと持たない）", () => {
    expect(normalizeMapDocumentNodeLinks([], 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("ちょうど 10 件、ちょうど 2,048 文字は受け付ける", () => {
    const max = `${BASE}${"a".repeat(NODE_LINK_MAX_LENGTH - BASE.length)}`;

    expect(normalizeMapDocumentNodeLinks(linksOf(NODE_LINKS_MAX_COUNT), 0, 3))
      .toEqual({ ok: true, value: linksOf(NODE_LINKS_MAX_COUNT) });
    expect(normalizeMapDocumentNodeLinks([max], 0, 3)).toEqual({ ok: true, value: [max] });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["文字列", A],
    ["オブジェクト", { 0: A }],
    ["数値の要素", [1]],
    ["null の要素", [null]],
    ["空文字の要素", [""]],
    ["空白だけの要素", ["   "]],
    ["スキームの無い要素", ["example.com"]],
    ["javascript: の要素", ["javascript:alert(1)"]],
    ["data: の要素", ["data:text/html,x"]],
    ["資格情報つきの要素", ["https://user:pass@example.com/"]],
    ["href が上限を超える要素", [`${BASE}${"あ".repeat(500)}`]],
    ["11 件", linksOf(NODE_LINKS_MAX_COUNT + 1)],
    ["正しい要素の後ろに不正な要素", [A, "javascript:alert(1)"]],
  ])("V3 で不正な links（%s）は失敗", (_name, links) => {
    expect(normalizeMapDocumentNodeLinks(links, 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("要素の長さは前後の空白を削る前の length で、解析より先に判定する（削れば上限内になる値も拒否する。L-443）", () => {
    const max = `${BASE}${"a".repeat(NODE_LINK_MAX_LENGTH - BASE.length)}`;

    expect(normalizeMapDocumentNodeLinks([`${max} `], 2, 3)).toEqual({ ok: false, error: ERROR });
  });
});
