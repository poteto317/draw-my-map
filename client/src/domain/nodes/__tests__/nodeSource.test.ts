import {
  NODE_SOURCES_MAX_COUNT,
  NODE_SOURCE_INPUT_MAX_LENGTH,
  NODE_SOURCE_PAGE_MAX_LENGTH,
  NODE_SOURCE_TITLE_MAX_LENGTH,
  addNodeSource,
  areNodeSourcesEqual,
  formatNodeSourceFailure,
  nodeSourceKey,
  normalizeNodeSource,
  normalizeNodeSourcePage,
  normalizeNodeSourceTitle,
  normalizeNodeSourceUrl,
  removeNodeSource,
  uniqueNodeSources,
  withNodeSources,
  type AddNodeSourceFailureReason,
  type NodeSource,
} from "@/domain/nodes/nodeSource";
import { NODE_LINK_MAX_LENGTH } from "@/domain/nodes/nodeLink";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const A_URL = "https://example.com/a";
const B_URL = "https://example.org/b";

function source(title: string, page?: string, url?: string): NodeSource {
  return {
    title,
    ...(page !== undefined ? { page } : {}),
    ...(url !== undefined ? { url } : {}),
  };
}

function sourcesOf(count: number): NodeSource[] {
  return Array.from({ length: count }, (_, index) => source(`book${index}`));
}

describe("定数", () => {
  it("件数の上限は 10、タイトル 200、ページ 80、入力先行 256", () => {
    expect(NODE_SOURCES_MAX_COUNT).toBe(10);
    expect(NODE_SOURCE_TITLE_MAX_LENGTH).toBe(200);
    expect(NODE_SOURCE_PAGE_MAX_LENGTH).toBe(80);
    expect(NODE_SOURCE_INPUT_MAX_LENGTH).toBe(256);
  });
});

describe("normalizeNodeSourceTitle", () => {
  it.each<[string, string, string]>([
    ["そのまま", "設計入門", "設計入門"],
    ["前後の空白を削る", "  設計入門  ", "設計入門"],
    ["内部のタブ・改行は半角スペース 1 個にまとめる", "機械\t学習\n入門", "機械 学習 入門"],
    ["連続する全角の空白は半角スペース 1 個にまとめる", "機械\u3000\u3000学習", "機械 学習"],
    ["NBSP・BOM も半角スペースにまとめる", "a\u00a0\ufeffb", "a b"],
    ["VT・FF・CR も空白としてまとめる（invalid にしない）", "a\u000b\u000c\rb", "a b"],
    ["大文字小文字・全角半角は変えない（最初の表記を残す）", "ＰｙＴｈｏｎ", "ＰｙＴｈｏｎ"],
    ["ゼロ幅結合子 U+200D は受け付ける（絵文字の連結）", "👨‍👩‍👧", "👨‍👩‍👧"],
  ])("%s", (_name, input, expected) => {
    expect(normalizeNodeSourceTitle(input)).toEqual({ ok: true, title: expected });
  });

  it.each<[string, string, "empty-title" | "invalid-title" | "too-long-title"]>([
    ["空文字", "", "empty-title"],
    ["空白だけ（タブ・改行・全角空白）", " \t\n\u3000", "empty-title"],
    ["NUL", "a\u0000b", "invalid-title"],
    ["ゼロ幅スペース U+200B", "a\u200bb", "invalid-title"],
    ["双方向制御 U+200E", "a\u200eb", "invalid-title"],
    ["NEL U+0085", "a\u0085b", "invalid-title"],
    ["WORD JOINER U+2060", "a\u2060b", "invalid-title"],
    ["ソフトハイフン U+00AD", "a\u00adb", "invalid-title"],
    ["行内注釈 U+FFF9", "a\ufff9b", "invalid-title"],
    ["タグ文字 U+E0001", "a\u{E0001}b", "invalid-title"],
    ["U+200D（ZWJ）だけ", "\u200d", "invalid-title"],
    ["U+200D と空白だけ", "\u200d \u200d", "invalid-title"],
  ])("%s は %s で拒否する", (_name, input, reason) => {
    expect(normalizeNodeSourceTitle(input)).toEqual({ ok: false, reason });
  });

  it("まとめた後がちょうど 200 文字なら受け付け、201 文字は too-long-title", () => {
    const max = "a".repeat(NODE_SOURCE_TITLE_MAX_LENGTH);

    expect(normalizeNodeSourceTitle(max)).toEqual({ ok: true, title: max });
    expect(normalizeNodeSourceTitle(` ${max} `)).toEqual({ ok: true, title: max });
    expect(normalizeNodeSourceTitle(`${max}a`)).toEqual({ ok: false, reason: "too-long-title" });
  });

  it("入力の先行判定は前後の空白を削った後の length で、256 ちょうどは通し、257 は too-long-title（L-443）", () => {
    const at = `a${" ".repeat(NODE_SOURCE_INPUT_MAX_LENGTH - 2)}b`;
    const over = `a${" ".repeat(NODE_SOURCE_INPUT_MAX_LENGTH - 1)}b`;

    expect(at.length).toBe(256);
    expect(normalizeNodeSourceTitle(at)).toEqual({ ok: true, title: "a b" });
    expect(over.length).toBe(257);
    expect(normalizeNodeSourceTitle(over)).toEqual({ ok: false, reason: "too-long-title" });
  });

  it("入力の先行判定は使えない文字の検査より先（制御文字だけの 257 文字でも too-long-title）", () => {
    expect(normalizeNodeSourceTitle("\u0000".repeat(NODE_SOURCE_INPUT_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too-long-title",
    });
  });

  it("使えない文字の検査は、まとめた後の長さより先（201 文字に制御文字を含めば invalid-title）", () => {
    expect(normalizeNodeSourceTitle(`\u0000${"a".repeat(NODE_SOURCE_TITLE_MAX_LENGTH)}`)).toEqual({
      ok: false,
      reason: "invalid-title",
    });
  });
});

describe("normalizeNodeSourcePage", () => {
  it.each<[string, string | undefined]>([
    ["空文字は無し", undefined],
    ["空白だけは無し", undefined],
    ["前後の空白を削る", "12"],
    ["連続空白をまとめる", "12 34"],
  ])("%s", (label, expected) => {
    const input =
      label === "空文字は無し"
        ? ""
        : label === "空白だけは無し"
          ? " \t\n\u3000"
          : label === "前後の空白を削る"
            ? "  12  "
            : "12\t\n34";
    expect(normalizeNodeSourcePage(input)).toEqual(
      expected === undefined ? { ok: true, page: undefined } : { ok: true, page: expected },
    );
  });

  it("まとめた後がちょうど 80 文字なら受け付け、81 文字は too-long-page", () => {
    const max = "p".repeat(NODE_SOURCE_PAGE_MAX_LENGTH);

    expect(normalizeNodeSourcePage(max)).toEqual({ ok: true, page: max });
    expect(normalizeNodeSourcePage(`${max}p`)).toEqual({ ok: false, reason: "too-long-page" });
  });

  it("入力の先行判定は 256 超で too-long-page（制御文字より先）", () => {
    expect(normalizeNodeSourcePage("\u0000".repeat(NODE_SOURCE_INPUT_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too-long-page",
    });
  });

  it("制御文字・不可視書式は invalid-page", () => {
    expect(normalizeNodeSourcePage("a\u0000b")).toEqual({ ok: false, reason: "invalid-page" });
    expect(normalizeNodeSourcePage("a\u200bb")).toEqual({ ok: false, reason: "invalid-page" });
  });

  it.each<[string, string]>([
    ["U+200D（ZWJ）だけ", "\u200d"],
    ["U+200D と空白だけ", "\u200d \u200d"],
  ])("%s は invalid-page", (_name, input) => {
    expect(normalizeNodeSourcePage(input)).toEqual({ ok: false, reason: "invalid-page" });
  });
});

describe("normalizeNodeSourceUrl", () => {
  it("空・空白だけは無しとして成功する", () => {
    expect(normalizeNodeSourceUrl("")).toEqual({ ok: true, url: undefined });
    expect(normalizeNodeSourceUrl(" \t\n ")).toEqual({ ok: true, url: undefined });
  });

  it("http/https は normalizeNodeLinkUrl と同じ href にする", () => {
    expect(normalizeNodeSourceUrl("  HTTPS://EXAMPLE.COM/Path ")).toEqual({
      ok: true,
      url: "https://example.com/Path",
    });
  });

  it.each<[string, string]>([
    ["javascript:", "unsupported-scheme"],
    ["https://user:pass@example.com/", "has-credentials"],
    ["example.com", "invalid"],
  ])("%s は %s で拒否する（empty にはしない）", (input, reason) => {
    expect(normalizeNodeSourceUrl(input)).toEqual({ ok: false, reason });
  });

  it("入力が長すぎれば too-long（リンクと同じ上限）", () => {
    expect(normalizeNodeSourceUrl("x".repeat(NODE_LINK_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too-long",
    });
  });
});

describe("normalizeNodeSource（検査順: タイトル → ページ → URL）", () => {
  it("タイトル・ページ・URL を正規化し、任意項目はキーごと外す", () => {
    expect(
      normalizeNodeSource({ title: "  設計  ", page: "  12  ", url: " HTTPS://example.com/a " }),
    ).toEqual({ ok: true, source: source("設計", "12", A_URL) });
    expect(normalizeNodeSource({ title: "設計", page: "  ", url: "  " })).toEqual({
      ok: true,
      source: source("設計"),
    });
  });

  it("タイトルが空ならページ／URL の不正より先に empty-title", () => {
    expect(normalizeNodeSource({ title: "", page: "a\u0000b", url: "javascript:alert(1)" })).toEqual({
      ok: false,
      reason: "empty-title",
    });
  });

  it("タイトル OK でページ不正なら URL より先にページの理由", () => {
    expect(normalizeNodeSource({ title: "設計", page: "a\u0000b", url: "javascript:alert(1)" })).toEqual({
      ok: false,
      reason: "invalid-page",
    });
  });

  it("タイトル・ページ OK で URL 不正なら URL の理由", () => {
    expect(normalizeNodeSource({ title: "設計", page: "12", url: "javascript:alert(1)" })).toEqual({
      ok: false,
      reason: "unsupported-scheme",
    });
  });
});

describe("nodeSourceKey", () => {
  it("タイトルの鍵（タグと同じ手順）+ page + url で比べる", () => {
    expect(nodeSourceKey(source("Python", "12", A_URL))).toBe(nodeSourceKey(source("python", "12", A_URL)));
    expect(nodeSourceKey(source("Python", "12", A_URL))).toBe(nodeSourceKey(source("ＰＹＴＨＯＮ", "12", A_URL)));
    expect(nodeSourceKey(source("AI"))).toBe(nodeSourceKey(source("A\u200dI")));
  });

  it("page / url の有無と値の違いは別の鍵", () => {
    expect(nodeSourceKey(source("設計"))).not.toBe(nodeSourceKey(source("設計", "12")));
    expect(nodeSourceKey(source("設計", "12"))).not.toBe(nodeSourceKey(source("設計", "13")));
    expect(nodeSourceKey(source("設計", undefined, A_URL))).not.toBe(nodeSourceKey(source("設計", undefined, B_URL)));
    expect(nodeSourceKey(source("設計"))).toBe(nodeSourceKey(source("設計", undefined, undefined)));
  });
});

describe("areNodeSourcesEqual", () => {
  it("要素の title/page/url を順比較し、別参照でも同内容なら真。undefined と空配列は同値", () => {
    const a = [source("設計", "12", A_URL)];
    const b = [source("設計", "12", A_URL)];

    expect(areNodeSourcesEqual(a, b)).toBe(true);
    expect(areNodeSourcesEqual(undefined, undefined)).toBe(true);
    expect(areNodeSourcesEqual(undefined, [])).toBe(true);
    expect(areNodeSourcesEqual([], undefined)).toBe(true);
  });

  it.each<[string, readonly NodeSource[] | undefined, readonly NodeSource[] | undefined]>([
    ["順が違う", [source("a"), source("b")], [source("b"), source("a")]],
    ["長さが違う", [source("a")], [source("a"), source("b")]],
    ["title が違う", [source("a")], [source("A")]],
    ["page の有無が違う", [source("a")], [source("a", "1")]],
    ["url が違う", [source("a", undefined, A_URL)], [source("a", undefined, B_URL)]],
    ["片方だけ持つ", undefined, [source("a")]],
  ])("%s なら偽", (_name, a, b) => {
    expect(areNodeSourcesEqual(a, b)).toBe(false);
  });
});

describe("uniqueNodeSources", () => {
  it("鍵が同じものは最初を残して後を捨て、順と表記を保つ", () => {
    expect(
      uniqueNodeSources([
        source("Python", "1"),
        source("設計"),
        source("python", "1"),
        source("ＰＹＴＨＯＮ", "1"),
        source("設計"),
        source("レビュー"),
      ]),
    ).toEqual([source("Python", "1"), source("設計"), source("レビュー")]);
  });

  it("空の並びは空の並びを返す", () => {
    expect(uniqueNodeSources([])).toEqual([]);
  });

  it("元の並びは変えない", () => {
    const sources = [source("a"), source("A")];
    uniqueNodeSources(sources);
    expect(sources).toEqual([source("a"), source("A")]);
  });
});

describe("formatNodeSourceFailure", () => {
  it.each<[Exclude<AddNodeSourceFailureReason, "empty-title">, string]>([
    ["too-long-title", "出典のタイトルが長すぎます（200 文字まで）。"],
    ["invalid-title", "出典のタイトルに使えない文字が含まれています。"],
    ["too-long-page", "出典のページが長すぎます（80 文字まで）。"],
    ["invalid-page", "出典のページに使えない文字が含まれています。"],
    ["too-long", "URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。"],
    ["invalid", "URLの形式が正しくありません。https:// から始まる URL を入力してください。"],
    ["unsupported-scheme", "http または https の URL だけを追加できます。"],
    ["has-credentials", "ユーザー名やパスワードを含む URL は追加できません。"],
    ["duplicate", "同じ出典がすでに追加されています。"],
    ["too-many", "出典は 1 つのノードに 10 件まで追加できます。"],
    ["node-missing", "ノードが見つかりません。"],
  ])("%s は「%s」", (reason, message) => {
    expect(formatNodeSourceFailure(reason)).toBe(message);
  });
});

describe("withNodeSources", () => {
  const node = createTestNode({ id: 1, label: "対象", sources: [source("設計")] });

  it("空でない並びなら sources にする（元のノードは変えない）", () => {
    expect(withNodeSources(node, [source("設計"), source("実装")])).toEqual({
      ...node,
      sources: [source("設計"), source("実装")],
    });
    expect(node.sources).toEqual([source("設計")]);
  });

  it.each([undefined, []])("%p なら sources のキーごと外す", (sources) => {
    const next = withNodeSources(node, sources);

    expect("sources" in next).toBe(false);
    expect(next).toEqual({
      id: 1,
      parentId: null,
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      label: "対象",
      importance: "medium",
    });
  });
});

describe("addNodeSource", () => {
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "出典あり", sources: [source("設計入門", "12", A_URL)] })),
    Object.freeze(createTestNode({ id: 2, label: "出典なし", x: 200 })),
    Object.freeze(createTestNode({ id: 3, label: "上限", x: 400, sources: sourcesOf(NODE_SOURCES_MAX_COUNT) })),
  ]);

  function success(id: number, input: { title: string; page?: string; url?: string }): Node[] {
    const result = addNodeSource(nodes, id, input);
    if (!result.ok) throw new Error(result.reason);
    return result.nodes;
  }

  it("正規化した出典を末尾に足し、ほかのノードは同じ参照のまま", () => {
    const next = success(1, { title: "  実装  ", page: "  3  ", url: " HTTPS://Example.org/b " });

    expect(next[0].sources).toEqual([source("設計入門", "12", A_URL), source("実装", "3", B_URL)]);
    expect(next[1]).toBe(nodes[1]);
    expect(next[2]).toBe(nodes[2]);
  });

  it("出典の無いノードには 1 件の並びを作る", () => {
    expect(success(2, { title: "設計" })[1]).toEqual({ ...nodes[1], sources: [source("設計")] });
  });

  it("9 件のノードには 10 件目を足せる", () => {
    const nine = [createTestNode({ id: 1, sources: sourcesOf(9) })];
    const result = addNodeSource(nine, 1, { title: "追加" });

    expect(result.ok && result.nodes[0].sources).toHaveLength(NODE_SOURCES_MAX_COUNT);
  });

  it("同じ title でも page / url が違えば追加できる", () => {
    const withTitle = [createTestNode({ id: 1, sources: [source("設計", "1")] })];
    const result = addNodeSource(withTitle, 1, { title: "設計", page: "2" });

    expect(result.ok && result.nodes[0].sources).toEqual([source("設計", "1"), source("設計", "2")]);
  });

  it("既存タイトル Python に全角 ＰＹＴＨＯＮ を足すと duplicate", () => {
    const withPython = [createTestNode({ id: 1, sources: [source("Python")] })];
    expect(addNodeSource(withPython, 1, { title: "ＰＹＴＨＯＮ" })).toEqual({
      ok: false,
      reason: "duplicate",
    });
  });

  it.each<[string, number, { title: string; page?: string; url?: string }, AddNodeSourceFailureReason]>([
    ["対象が無い（タイトル不正でも node-missing を先に返す）", 99, { title: "a\u0000b" }, "node-missing"],
    ["タイトルが空白だけ", 2, { title: "   " }, "empty-title"],
    ["タイトルに使えない文字", 2, { title: "a\u200bb" }, "invalid-title"],
    ["タイトルが長すぎる", 2, { title: "a".repeat(NODE_SOURCE_TITLE_MAX_LENGTH + 1) }, "too-long-title"],
    ["ページに使えない文字", 2, { title: "設計", page: "a\u0000b" }, "invalid-page"],
    ["ページが長すぎる", 2, { title: "設計", page: "p".repeat(NODE_SOURCE_PAGE_MAX_LENGTH + 1) }, "too-long-page"],
    ["URL が javascript:", 2, { title: "設計", url: "javascript:alert(1)" }, "unsupported-scheme"],
    ["URL に資格情報", 2, { title: "設計", url: "https://user:pass@example.com/" }, "has-credentials"],
    ["同じ鍵の出典がすでにある（大文字小文字）", 1, { title: "設計入門", page: "12", url: A_URL }, "duplicate"],
    ["同じ鍵の出典がすでにある（全角半角のタイトル）", 1, { title: "設計入門", page: "12", url: "https://example.com/a" }, "duplicate"],
    ["上限の 10 件に達している", 3, { title: "追加" }, "too-many"],
    ["上限に達していても、同じ鍵なら duplicate を先に返す", 3, { title: "BOOK0" }, "duplicate"],
    ["上限に達していても、タイトル不正なら正規化の理由を先に返す", 3, { title: "a\u0000b" }, "invalid-title"],
  ])("%s ときは失敗の理由を返す", (_name, id, input, reason) => {
    expect(addNodeSource(nodes, id, input)).toEqual({ ok: false, reason });
  });
});

describe("removeNodeSource", () => {
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(
      createTestNode({
        id: 1,
        label: "2件",
        sources: [source("設計", "1"), source("実装", "2")],
      }),
    ),
    Object.freeze(createTestNode({ id: 2, label: "1件", x: 200, sources: [source("設計")] })),
    Object.freeze(createTestNode({ id: 3, label: "0件", x: 400 })),
  ]);

  it("指定 index の出典だけを消し、順を保ち、ほかのノードは同じ参照のまま", () => {
    const next = removeNodeSource(nodes, 1, 0);

    expect(next?.[0].sources).toEqual([source("実装", "2")]);
    expect(next?.[1]).toBe(nodes[1]);
    expect(nodes[0].sources).toEqual([source("設計", "1"), source("実装", "2")]);
  });

  it("最後の 1 件を消すと sources のキーごと外す（空配列を残さない）", () => {
    const next = removeNodeSource(nodes, 2, 0);

    expect(next).not.toBeNull();
    expect("sources" in next![1]).toBe(false);
  });

  it.each<[string, number, number]>([
    ["対象が無い", 99, 0],
    ["出典の無いノード", 3, 0],
    ["index が負", 1, -1],
    ["index が範囲外", 1, 2],
  ])("%s ときは null（何も変えない）", (_name, id, index) => {
    expect(removeNodeSource(nodes, id, index)).toBeNull();
  });
});
