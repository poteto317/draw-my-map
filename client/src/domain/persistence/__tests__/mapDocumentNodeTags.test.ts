import { NODE_TAGS_MAX_COUNT, NODE_TAG_INPUT_MAX_LENGTH, NODE_TAG_MAX_LENGTH } from "@/domain/nodes/nodeTag";
import { normalizeMapDocumentNodeTags } from "@/domain/persistence/mapDocumentNodeTags";

const ERROR = "node[2].tagsは、30文字以内のタグ名の配列（最大10件）である必要があります。";

// タグ名を count 件（tag0 …）
function tagsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tag${index}`);
}

describe("normalizeMapDocumentNodeTags", () => {
  it.each([1, 2] as const)("V%d では tags を無視して undefined を返す（不正な値でも失敗にしない）", (version) => {
    expect(normalizeMapDocumentNodeTags(["重要"], 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeTags("重要", 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で undefined なら undefined", () => {
    expect(normalizeMapDocumentNodeTags(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の各要素を正規化した名前（前後の空白を削り、連続する空白を 1 個にまとめる）にし、順を保つ", () => {
    expect(normalizeMapDocumentNodeTags([" 重要 ", "機械\t\t学習"], 0, 3))
      .toEqual({ ok: true, value: ["重要", "機械 学習"] });
  });

  it("同じタグとみなす要素（NFKC＋小文字化で同じ）は、後のものを捨てる（最初の表記を残す）", () => {
    expect(normalizeMapDocumentNodeTags(["Python", "python", "Ｐｙｔｈｏｎ", "重要"], 0, 3))
      .toEqual({ ok: true, value: ["Python", "重要"] });
  });

  it("U+200D・U+FE0F を挟んだだけの違いは同じタグとみなし、後のものを捨てる（最初の表記を残す）", () => {
    expect(normalizeMapDocumentNodeTags(["AI", "A\u200dI", "A\ufe0fI"], 0, 3)).toEqual({ ok: true, value: ["AI"] });
  });

  it("3 文字を除いて空白が残る組（AI と末尾に空白と U+200D、機械 学習 と間に U+200D を挟んだもの）も同じタグとみなす", () => {
    expect(normalizeMapDocumentNodeTags(["AI", "AI \u200d"], 0, 3)).toEqual({ ok: true, value: ["AI"] });
    expect(normalizeMapDocumentNodeTags(["機械 学習", "機械 \u200d 学習"], 0, 3)).toEqual({ ok: true, value: ["機械 学習"] });
  });

  it("合成済みの文字と、U+200D で合成が途切れた並び（é・ガ・가・Å）は同じタグとみなし、後のものを捨てる", () => {
    expect(normalizeMapDocumentNodeTags(["\u00e9", "e\u200d\u0301"], 0, 3)).toEqual({ ok: true, value: ["\u00e9"] });
    expect(normalizeMapDocumentNodeTags(["\u30ac", "\uff76\u200d\uff9e", "\u30ab\u200d\u3099"], 0, 3)).toEqual({ ok: true, value: ["\u30ac"] });
    expect(normalizeMapDocumentNodeTags(["\uac00", "\u1100\u200d\u1161"], 0, 3)).toEqual({ ok: true, value: ["\uac00"] });
    expect(normalizeMapDocumentNodeTags(["\u00c5", "A\ufe0e\u030a"], 0, 3)).toEqual({ ok: true, value: ["\u00c5"] });
  });

  it("絵文字（ZWJ・異体字セレクタを含む）は名前をそのまま保つ", () => {
    expect(normalizeMapDocumentNodeTags(["\u{1F468}\u200d\u{1F469}", "\u2764\ufe0f"], 0, 3))
      .toEqual({ ok: true, value: ["\u{1F468}\u200d\u{1F469}", "\u2764\ufe0f"] });
  });

  it("空の配列は undefined（項目ごと持たない）", () => {
    expect(normalizeMapDocumentNodeTags([], 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("ちょうど 10 件、ちょうど 30 文字は受け付ける", () => {
    const max = "a".repeat(NODE_TAG_MAX_LENGTH);

    expect(normalizeMapDocumentNodeTags(tagsOf(NODE_TAGS_MAX_COUNT), 0, 3))
      .toEqual({ ok: true, value: tagsOf(NODE_TAGS_MAX_COUNT) });
    expect(normalizeMapDocumentNodeTags([max], 0, 3)).toEqual({ ok: true, value: [max] });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["文字列", "重要"],
    ["オブジェクト", { 0: "重要" }],
    ["数値の要素", [1]],
    ["null の要素", [null]],
    ["空文字の要素", [""]],
    ["空白だけの要素", ["   "]],
    ["制御文字を含む要素", ["a\u0000b"]],
    ["ゼロ幅スペースを含む要素", ["a\u200bb"]],
    ["WORD JOINER（U+2060）を含む要素", ["A\u2060I"]],
    ["U+200D だけの要素（見た目が空）", ["\u200d"]],
    ["U+200D の間に空白だけの要素（見た目が空白だけ）", ["\u200d \u200d"]],
    ["U+FE0F だけの要素（見た目が空）", ["\ufe0f"]],
    ["31 文字の要素", ["a".repeat(NODE_TAG_MAX_LENGTH + 1)]],
    ["11 件", tagsOf(NODE_TAGS_MAX_COUNT + 1)],
    ["正しい要素の後ろに不正な要素", ["重要", "a\u0000b"]],
  ])("V3 で不正な tags（%s）は失敗", (_name, tags) => {
    expect(normalizeMapDocumentNodeTags(tags, 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("11 件は、同じタグとみなす要素を除けば 10 件以下でも失敗（件数は正規化より先に判定する。L-443）", () => {
    expect(normalizeMapDocumentNodeTags([...tagsOf(NODE_TAGS_MAX_COUNT), "TAG0"], 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("要素の長さは前後の空白を削る前の length で、正規化より先に判定する（削れば 1 文字になる 257 文字も拒否する。L-443）", () => {
    expect(normalizeMapDocumentNodeTags([`${" ".repeat(NODE_TAG_INPUT_MAX_LENGTH)}a`], 2, 3)).toEqual({ ok: false, error: ERROR });
    expect(normalizeMapDocumentNodeTags([`${" ".repeat(NODE_TAG_INPUT_MAX_LENGTH - 1)}a`], 2, 3)).toEqual({ ok: true, value: ["a"] });
  });
});
