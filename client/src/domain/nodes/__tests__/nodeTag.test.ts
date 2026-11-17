import {
  NODE_TAGS_MAX_COUNT,
  NODE_TAG_INPUT_MAX_LENGTH,
  NODE_TAG_MAX_LENGTH,
  addNodeTag,
  areNodeTagsEqual,
  formatNodeTagFailure,
  nodeTagKey,
  normalizeNodeTagName,
  removeNodeTag,
  uniqueNodeTags,
  withNodeTags,
  type AddNodeTagFailureReason,
  type NodeTagNameFailureReason,
} from "@/domain/nodes/nodeTag";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

// タグ名を count 件（tag0 …）
function tagsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tag${index}`);
}

describe("定数", () => {
  it("件数の上限は 10、長さの上限は 30、入力の先行判定は 256", () => {
    expect(NODE_TAGS_MAX_COUNT).toBe(10);
    expect(NODE_TAG_MAX_LENGTH).toBe(30);
    expect(NODE_TAG_INPUT_MAX_LENGTH).toBe(256);
  });
});

describe("normalizeNodeTagName", () => {
  it.each<[string, string, string]>([
    ["そのまま", "Python", "Python"],
    ["前後の空白を削る", "  Python  ", "Python"],
    ["内部のタブ・改行は半角スペース 1 個にまとめる", "機械\t学習\n入門", "機械 学習 入門"],
    ["連続する全角の空白は半角スペース 1 個にまとめる", "機械\u3000\u3000学習", "機械 学習"],
    ["NBSP・BOM も半角スペースにまとめる", "a\u00a0\ufeffb", "a b"],
    ["VT・FF・CR も空白としてまとめる（invalid にしない）", "a\u000b\u000c\rb", "a b"],
    ["大文字小文字・全角半角は変えない（最初の表記を残す）", "ＰｙＴｈｏｎ", "ＰｙＴｈｏｎ"],
    ["# 始まりもそのまま名前", "#python", "#python"],
    ["HTML のような文字もそのまま名前", "<b>x</b>", "<b>x</b>"],
    ["ゼロ幅結合子 U+200D は受け付ける（絵文字の連結）", "👨‍👩‍👧", "👨‍👩‍👧"],
    ["対になっていないサロゲートは特別に扱わない", "a\ud800b", "a\ud800b"],
  ])("%s", (_name, input, expected) => {
    expect(normalizeNodeTagName(input)).toEqual({ ok: true, name: expected });
  });

  it.each<[string, string, NodeTagNameFailureReason]>([
    ["空文字", "", "empty"],
    ["空白だけ（タブ・改行・全角空白）", " \t\n\u3000", "empty"],
    ["NUL", "a\u0000b", "invalid"],
    ["U+0008", "a\u0008b", "invalid"],
    ["U+000E", "a\u000eb", "invalid"],
    ["U+001F", "a\u001fb", "invalid"],
    ["DEL U+007F", "a\u007fb", "invalid"],
    ["NEL U+0085（\\s に含まれない）", "a\u0085b", "invalid"],
    ["U+009F", "a\u009fb", "invalid"],
    ["ゼロ幅スペース U+200B", "a\u200bb", "invalid"],
    ["双方向制御 U+061C", "a\u061cb", "invalid"],
    ["双方向制御 U+200E", "a\u200eb", "invalid"],
    ["双方向制御 U+200F", "a\u200fb", "invalid"],
    ["双方向制御 U+202A", "a\u202ab", "invalid"],
    ["双方向制御 U+202E", "a\u202eb", "invalid"],
    ["双方向制御 U+2066", "a\u2066b", "invalid"],
    ["双方向制御 U+2069", "a\u2069b", "invalid"],
  ])("%s は %s で拒否する", (_name, input, reason) => {
    expect(normalizeNodeTagName(input)).toEqual({ ok: false, reason });
  });

  it.each<[string, string]>([
    ["WORD JOINER U+2060", "a\u2060b"],
    ["U+2061（見えない関数適用）", "a\u2061b"],
    ["ソフトハイフン U+00AD", "a\u00adb"],
    ["モンゴル母音分離 U+180E", "a\u180eb"],
    ["ハングル filler U+3164", "a\u3164b"],
    ["ハングル choseong filler U+115F", "a\u115fb"],
    ["結合書記素ジョイナー U+034F", "a\u034fb"],
    ["異体字セレクタ U+FE00", "a\ufe00b"],
    ["U+FE0D", "a\ufe0db"],
    ["行内注釈 U+FFF9", "a\ufff9b"],
    ["タグ文字 U+E0001（サロゲートペア）", "a\u{E0001}b"],
  ])("見えない書式文字 %s は invalid で拒否する", (_name, input) => {
    expect(normalizeNodeTagName(input)).toEqual({ ok: false, reason: "invalid" });
  });

  it.each<[string, string]>([
    ["U+200D だけ", "\u200d"],
    ["U+FE0F だけ", "\ufe0f"],
    ["U+FE0E だけ", "\ufe0e"],
    ["U+200D と U+FE0F だけ", "\u200d\ufe0f"],
  ])("許可した見えない書式文字だけの名前（%s）は、見た目が空なので invalid で拒否する", (_name, input) => {
    expect(normalizeNodeTagName(input)).toEqual({ ok: false, reason: "invalid" });
  });

  it.each<[string, string]>([
    ["家族の絵文字（U+200D で連結）", "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}"],
    ["絵文字表示の異体字セレクタ U+FE0F", "\u2764\ufe0f"],
    ["テキスト表示の異体字セレクタ U+FE0E", "\u2764\ufe0e"],
  ])("絵文字に要る %s は受け付ける", (_name, input) => {
    expect(normalizeNodeTagName(input)).toEqual({ ok: true, name: input });
  });

  it("まとめた後がちょうど 30 文字なら受け付け、31 文字は too-long", () => {
    const max = "a".repeat(NODE_TAG_MAX_LENGTH);

    expect(normalizeNodeTagName(max)).toEqual({ ok: true, name: max });
    expect(normalizeNodeTagName(` ${max} `)).toEqual({ ok: true, name: max });
    expect(normalizeNodeTagName(`${max}a`)).toEqual({ ok: false, reason: "too-long" });
  });

  it("長さは空白をまとめた後で数える（入力が 32 文字でも、まとめて 30 文字なら受け付ける）", () => {
    const input = `${"a".repeat(14)}   ${"b".repeat(15)}`;

    expect(input.length).toBe(32);
    expect(normalizeNodeTagName(input)).toEqual({ ok: true, name: `${"a".repeat(14)} ${"b".repeat(15)}` });
  });

  it("サロゲートペアは length 2 として数える（絵文字 15 個で 30 文字、16 個は too-long）", () => {
    expect(normalizeNodeTagName("😀".repeat(15))).toEqual({ ok: true, name: "😀".repeat(15) });
    expect(normalizeNodeTagName("😀".repeat(16))).toEqual({ ok: false, reason: "too-long" });
  });

  it("入力の先行判定は前後の空白を削った後の length で、256 文字ちょうどは通し、257 文字は too-long（L-443）", () => {
    const at = `a${" ".repeat(NODE_TAG_INPUT_MAX_LENGTH - 2)}b`;
    const over = `a${" ".repeat(NODE_TAG_INPUT_MAX_LENGTH - 1)}b`;

    expect(at.length).toBe(256);
    expect(normalizeNodeTagName(at)).toEqual({ ok: true, name: "a b" });
    expect(normalizeNodeTagName(`  ${at}  `)).toEqual({ ok: true, name: "a b" });
    expect(over.length).toBe(257);
    expect(normalizeNodeTagName(over)).toEqual({ ok: false, reason: "too-long" });
  });

  it("入力の先行判定は使えない文字の検査より先（制御文字だけの 257 文字でも too-long）", () => {
    expect(normalizeNodeTagName("\u0000".repeat(NODE_TAG_INPUT_MAX_LENGTH + 1))).toEqual({ ok: false, reason: "too-long" });
  });

  it("使えない文字の検査は、まとめた後の長さより先（41 文字に制御文字を含めば invalid）", () => {
    expect(normalizeNodeTagName(`\u0000${"a".repeat(40)}`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("巨大な入力（10 万文字）も too-long で返す", () => {
    expect(normalizeNodeTagName("x".repeat(100_000))).toEqual({ ok: false, reason: "too-long" });
  });
});

describe("nodeTagKey", () => {
  it.each<[string, string, string]>([
    ["大文字小文字", "Python", "PYTHON"],
    ["全角と半角の英字", "python", "ｐｙｔｈｏｎ"],
    ["半角カナと全角カナ", "ﾊﾟｲｿﾝ", "パイソン"],
    ["丸数字と数字", "①", "1"],
  ])("%s を同じ鍵にする", (_name, a, b) => {
    expect(nodeTagKey(a)).toBe(nodeTagKey(b));
  });

  it("NFKC＋小文字化の値を返す", () => {
    expect(nodeTagKey("Ｐｙｔｈｏｎ")).toBe("python");
  });

  it.each<[string, string, string]>([
    ["U+200D（ZWJ）を挟んだもの", "A\u200dI", "AI"],
    ["U+FE0F（絵文字表示の異体字セレクタ）を挟んだもの", "A\ufe0fI", "AI"],
    ["U+FE0E（テキスト表示の異体字セレクタ）を挟んだもの", "A\ufe0eI", "AI"],
    ["絵文字の ❤ と ❤️", "\u2764", "\u2764\ufe0f"],
  ])("%s は、ないものと同じ鍵にする", (_name, a, b) => {
    expect(nodeTagKey(a)).toBe(nodeTagKey(b));
  });

  it("空白の有無は区別する（空白は名前の検査でまとめる）", () => {
    expect(nodeTagKey("機械学習")).not.toBe(nodeTagKey("機械 学習"));
  });
});

describe("areNodeTagsEqual", () => {
  it("要素ごとに比べ、別の配列でも内容が同じなら真", () => {
    expect(areNodeTagsEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(areNodeTagsEqual(undefined, undefined)).toBe(true);
    expect(areNodeTagsEqual(undefined, [])).toBe(true);
  });

  it.each<[string, readonly string[] | undefined, readonly string[] | undefined]>([
    ["順が違う", ["a", "b"], ["b", "a"]],
    ["長さが違う", ["a"], ["a", "b"]],
    ["表記が違う（同じ鍵でも別の値）", ["Python"], ["python"]],
    ["片方だけ持つ", undefined, ["a"]],
  ])("%s なら偽", (_name, a, b) => {
    expect(areNodeTagsEqual(a, b)).toBe(false);
  });
});

describe("uniqueNodeTags", () => {
  it("nodeTagKey が同じものは最初に出てきたものを残して除き、順と表記を保つ", () => {
    expect(uniqueNodeTags(["Python", "設計", "python", "ＰＹＴＨＯＮ", "レビュー", "設計"])).toEqual(["Python", "設計", "レビュー"]);
  });

  it("U+200D・U+FE0F・U+FE0E を挟んだだけの違いは同じタグとみなし、最初の表記を残す", () => {
    expect(uniqueNodeTags(["AI", "A\u200dI", "A\ufe0fI", "A\ufe0eI"])).toEqual(["AI"]);
    expect(uniqueNodeTags(["A\u200dI", "AI"])).toEqual(["A\u200dI"]);
  });

  it("空の並びは空の並びを返す", () => {
    expect(uniqueNodeTags([])).toEqual([]);
  });

  it("元の並びは変えない", () => {
    const tags = ["a", "A"];
    uniqueNodeTags(tags);
    expect(tags).toEqual(["a", "A"]);
  });
});

describe("formatNodeTagFailure", () => {
  it.each<[Exclude<AddNodeTagFailureReason, "empty">, string]>([
    ["too-long", "タグ名が長すぎます（30 文字まで）。"],
    ["invalid", "タグ名に使えない文字が含まれています。"],
    ["duplicate", "同じタグがすでに追加されています。"],
    ["too-many", "タグは 1 つのノードに 10 件まで追加できます。"],
    ["node-missing", "ノードが見つかりません。"],
  ])("%s は「%s」", (reason, message) => {
    expect(formatNodeTagFailure(reason)).toBe(message);
  });
});

describe("withNodeTags", () => {
  const node = createTestNode({ id: 1, label: "対象", tags: ["a"] });

  it("空でない並びなら tags にする（元のノードは変えない）", () => {
    expect(withNodeTags(node, ["a", "b"])).toEqual({ ...node, tags: ["a", "b"] });
    expect(node.tags).toEqual(["a"]);
  });

  it.each([undefined, []])("%p なら tags のキーごと外す", (tags) => {
    const next = withNodeTags(node, tags);

    expect("tags" in next).toBe(false);
    expect(next).toEqual({ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "対象", importance: "medium" });
  });
});

describe("addNodeTag", () => {
  // 1: タグあり、2: タグなし、3: 上限まで。ラベルは全ノードで変える（L-168）
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "タグあり", tags: ["Python"] })),
    Object.freeze(createTestNode({ id: 2, label: "タグなし", x: 200 })),
    Object.freeze(createTestNode({ id: 3, label: "上限", x: 400, tags: tagsOf(NODE_TAGS_MAX_COUNT) })),
    Object.freeze(createTestNode({ id: 4, label: "AI", x: 600, tags: ["AI"] })),
  ]);

  function success(id: number, input: string): Node[] {
    const result = addNodeTag(nodes, id, input);
    if (!result.ok) throw new Error(result.reason);
    return result.nodes;
  }

  it("まとめた名前を末尾に足し、ほかのノードは同じ参照のまま", () => {
    const next = success(1, "  機械\t学習 ");

    expect(next[0].tags).toEqual(["Python", "機械 学習"]);
    expect(next[1]).toBe(nodes[1]);
    expect(next[2]).toBe(nodes[2]);
  });

  it("絵文字（ZWJ・異体字セレクタを含む）は追加でき、名前は入力どおりに保存する", () => {
    const family = "\u{1F468}\u200d\u{1F469}";
    const heart = "\u2764\ufe0f";

    expect(success(2, family)[1].tags).toEqual([family]);
    expect(success(2, heart)[1].tags).toEqual([heart]);
  });

  it("❤ と ❤️ は同じタグ（後から足す表記は duplicate。保存済みの表記はそのまま）", () => {
    const heart = "\u2764\ufe0f";
    const withHeart = [createTestNode({ id: 1, tags: [heart] })];

    expect(addNodeTag(withHeart, 1, "\u2764")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("タグの無いノードには 1 件の並びを作る", () => {
    expect(success(2, "重要")[1]).toEqual({ ...nodes[1], tags: ["重要"] });
  });

  it("9 件のノードには 10 件目を足せる", () => {
    const nine = [createTestNode({ id: 1, tags: tagsOf(9) })];
    const result = addNodeTag(nine, 1, "重要");

    expect(result.ok && result.nodes[0].tags).toHaveLength(NODE_TAGS_MAX_COUNT);
  });

  it.each<[string, number, string, AddNodeTagFailureReason]>([
    ["対象が無い（タグ名が不正でも node-missing を先に返す）", 99, "a\u0000b", "node-missing"],
    ["空白だけ", 2, "   ", "empty"],
    ["使えない文字", 2, "a\u200bb", "invalid"],
    ["長すぎる", 2, "a".repeat(NODE_TAG_MAX_LENGTH + 1), "too-long"],
    ["見えない書式文字を挟んだだけの同じ見た目のタグ（重複ではなく invalid）", 1, "P\u2060ython", "invalid"],
    ["大文字小文字だけが違う同じタグがすでにある", 1, "python", "duplicate"],
    ["全角半角だけが違う同じタグがすでにある", 1, "Ｐｙｔｈｏｎ", "duplicate"],
    ["U+200D（ZWJ）を挟んだだけの同じ見た目のタグがすでにある", 4, "A\u200dI", "duplicate"],
    ["U+FE0F を挟んだだけの同じ見た目のタグがすでにある", 4, "A\ufe0fI", "duplicate"],
    ["U+FE0E を挟んだだけの同じ見た目のタグがすでにある", 4, "A\ufe0eI", "duplicate"],
    ["U+200D だけの名前（見た目が空）", 2, "\u200d", "invalid"],
    ["U+FE0F だけの名前（見た目が空）", 2, "\ufe0f", "invalid"],
    ["U+200D と U+FE0F だけの名前（見た目が空）", 2, "\u200d\ufe0f", "invalid"],
    ["上限の 10 件に達している", 3, "重要", "too-many"],
    ["上限に達していても、同じタグなら duplicate を先に返す", 3, "TAG0", "duplicate"],
    ["上限に達していても、タグ名が不正なら名前の理由を先に返す", 3, "a\u0000b", "invalid"],
  ])("%s ときは失敗の理由を返す", (_name, id, input, reason) => {
    expect(addNodeTag(nodes, id, input)).toEqual({ ok: false, reason });
  });
});

describe("removeNodeTag", () => {
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "2件", tags: ["Python", "重要"] })),
    Object.freeze(createTestNode({ id: 2, label: "1件", x: 200, tags: ["Python"] })),
    Object.freeze(createTestNode({ id: 3, label: "0件", x: 400 })),
  ]);

  it("指定のタグだけを消し、順を保ち、ほかのノードは同じ参照のまま", () => {
    const next = removeNodeTag(nodes, 1, "Python");

    expect(next?.[0].tags).toEqual(["重要"]);
    expect(next?.[1]).toBe(nodes[1]);
    expect(nodes[0].tags).toEqual(["Python", "重要"]);
  });

  it("最後の 1 件を消すと tags のキーごと外す（空配列を残さない）", () => {
    const next = removeNodeTag(nodes, 2, "Python");

    expect(next).not.toBeNull();
    expect("tags" in next![1]).toBe(false);
  });

  it.each<[string, number, string]>([
    ["対象が無い", 99, "Python"],
    ["そのタグを持たない", 2, "重要"],
    ["タグの無いノード", 3, "Python"],
    ["表記違い（保存した名前と完全に一致しない）", 2, "python"],
  ])("%s ときは null（何も変えない）", (_name, id, tag) => {
    expect(removeNodeTag(nodes, id, tag)).toBeNull();
  });
});
