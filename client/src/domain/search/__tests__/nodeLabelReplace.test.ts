import { listLabelReplacements, planLabelReplace } from "@/domain/search/nodeLabelReplace";
import { createTestNode } from "@/testing/createTestNode";

function plan(labels: readonly string[], query: string, replacement: string, targetIds: ReadonlySet<number> | null = null) {
  const nodes = labels.map((label, index) => createTestNode({ id: index + 1, label }));
  return planLabelReplace(nodes, { query, replacement, targetIds });
}

describe("planLabelReplace", () => {
  it("大文字小文字と全角・半角を区別せず一致し、置換語は入力どおりに入れる", () => {
    const result = plan(["Apple", "ＡＰＰＬＥ", "banana"], "apple", "Ｏｒａｎｇｅ");

    expect(result.rows.map((row) => [row.nodeId, row.before, row.after, row.status])).toEqual([
      [1, "Apple", "Ｏｒａｎｇｅ", "replace"],
      [2, "ＡＰＰＬＥ", "Ｏｒａｎｇｅ", "replace"],
    ]);
    expect(result.replaceCount).toBe(2);
    expect(result.emptiedCount).toBe(0);
  });

  it("1 つのラベルの重ならない出現を左からすべて置換し、置換語を再び探さない", () => {
    expect(plan(["aXaXa"], "x", "-").rows[0]).toMatchObject({ after: "a-a-a", matchCount: 2 });
    expect(plan(["aXaXa"], "a", "bb").rows[0]).toMatchObject({ after: "bbXbbXbb", matchCount: 3 });
    expect(plan(["aa"], "a", "aa").rows[0]).toMatchObject({ after: "aaaa", matchCount: 2 });
  });

  it("検索語の前後の空白を削らずに使う", () => {
    expect(plan(["a  b", "a b"], "  ", " ").rows.map((row) => row.after)).toEqual(["a b"]);
    expect(plan(["x y"], " ", "").rows[0].after).toBe("xy");
  });

  it("置換語の特殊パターンを文字どおりに入れる", () => {
    expect(plan(["a"], "a", "$&$1").rows[0].after).toBe("$&$1");
  });

  it("検索語が空なら行を返さない", () => {
    expect(plan(["abc"], "", "x")).toEqual({ rows: [], replaceCount: 0, emptiedCount: 0 });
  });

  it("置換後のラベルが空になるノードは emptied にして置換対象に数えない", () => {
    const result = plan(["旧", "旧新"], "旧", "");

    expect(result.rows.map((row) => [row.before, row.after, row.status])).toEqual([
      ["旧", "", "emptied"],
      ["旧新", "新", "replace"],
    ]);
    expect(result.replaceCount).toBe(1);
    expect(result.emptiedCount).toBe(1);
  });

  it("一致しても置換前後が同じなら unchanged にして置換対象に数えない", () => {
    const result = plan(["abc"], "ABC", "abc");

    expect(result.rows).toEqual([
      { nodeId: 1, before: "abc", after: "abc", matchCount: 1, status: "unchanged" },
    ]);
    expect(result.replaceCount).toBe(0);
  });

  it("targetIds があればその集合のノードだけを調べる", () => {
    const labels = ["x1", "x2", "x3"];
    expect(plan(labels, "x", "y", new Set([2])).rows.map((row) => [row.nodeId, row.after])).toEqual([[2, "y2"]]);
  });

  it("targetIds が空集合なら全ノード扱いにせず行を返さない", () => {
    expect(plan(["x1", "x2"], "x", "y", new Set()).rows).toEqual([]);
  });

  it("targetIds の ID がどのノードにも無ければ行を返さない", () => {
    expect(plan(["x1", "x2"], "x", "y", new Set([99])).rows).toEqual([]);
  });

  describe("正規化で長さが変わる文字の位置の対応づけ", () => {
    it("合字の途中ではなく後ろの一致を、元の文字の位置で置換する", () => {
      expect(plan(["ﬁne"], "ne", "XX").rows[0].after).toBe("ﬁXX");
    });

    it("組文字の後ろの一致を、元の文字を壊さず置換する", () => {
      expect(plan(["㈱A"], "a", "X").rows[0].after).toBe("㈱X");
    });

    it("組文字全体に一致するときは元の 1 文字を置換する", () => {
      expect(plan(["㈱"], "(株)", "X").rows[0].after).toBe("X");
    });

    it("組文字の途中で切れる一致は一致として扱わない", () => {
      expect(plan(["㈱"], "(", "X").rows).toEqual([]);
      expect(plan(["ﬁ"], "f", "X").rows).toEqual([]);
    });

    it("失敗した一致の直後の位置から探し直し、後ろの正しい一致を取りこぼさない", () => {
      const row = plan(["㈱("], "(", "X").rows[0];

      expect(row.after).toBe("㈱X");
      expect(row.matchCount).toBe(1);
    });

    it("小文字化で長さが変わる文字の途中には一致しない", () => {
      expect(plan(["İ"], "i", "X").rows).toEqual([]);
    });

    it("結合文字で合成される文字の途中には一致しない", () => {
      // 合成済みの ä（U+00E4）と、a + U+0308 のどちらのラベルでも a では一致しない
      expect(plan(["\u00e4"], "a", "X").rows).toEqual([]);
      expect(plan(["a\u0308"], "a", "X").rows).toEqual([]);
      expect(plan(["\u00e4b"], "a", "X").rows).toEqual([]);
      expect(plan(["a\u0308b"], "a", "X").rows).toEqual([]);
    });

    it("結合文字の直後の一致は、結合文字を置換語へ巻き込まず元の位置で置換する", () => {
      // 有効な境界の判定が無いと、a の直後の境界を始点にして U+0308 を消してしまう
      expect(plan(["a\u0308a"], "a", "X").rows[0].after).toBe("a\u0308X");
      expect(plan(["a\u0308b"], "b", "X").rows[0].after).toBe("a\u0308X");
    });

    it.each([
      ["ä（合成済み U+00E4）", "\u00e4b", "\u00e4", "Xb"],
      ["a + U+0308 を合成済みの ä で検索すると 2 文字ごと置換する", "a\u0308b", "\u00e4", "Xb"],
      ["が（合成済み U+304C）", "\u304c\u304d", "\u304c", "X\u304d"],
      ["か + 濁点（U+304B U+3099）を合成済みの が で検索する", "\u304b\u3099\u304d", "\u304c", "X\u304d"],
      ["ハングル音節（U+AC00）", "\uac00b", "\uac00", "Xb"],
      ["ハングル字母（U+1100 U+1161）を音節で検索する", "\u1100\u1161b", "\uac00", "Xb"],
    ])("合成された文字の全体には一致して置換する: %s", (_name, label, query, expected) => {
      expect(plan([label], query, "X").rows[0].after).toBe(expected);
    });
  });
});

describe("planLabelReplace の文字の扱い（現在の挙動の固定）", () => {
  it("サロゲートペアを壊さずに、ペアの前後の文字だけを置換する", () => {
    expect(plan(["\u{1F600}a\u{1F600}"], "a", "X").rows[0].after).toBe("\u{1F600}X\u{1F600}");
    expect(plan(["\u{1F600}a"], "\u{1F600}", "X").rows[0].after).toBe("Xa");
  });

  it("NFKC で ASCII になる数学用太字は、大文字小文字を区別せず一致して丸ごと置換する", () => {
    // U+1D400 は数学用太字の A（NFKC で A、小文字化で a）
    expect(plan(["\u{1D400}b"], "a", "X").rows[0]).toMatchObject({ after: "Xb", matchCount: 1 });
    expect(plan(["\u{1D400}b"], "A", "X").rows[0].after).toBe("Xb");
  });

  it("検索語・置換語の制御文字・ゼロ幅文字・改行を文字どおりに扱う", () => {
    expect(plan(["a​b"], "​", "-").rows[0].after).toBe("a-b");
    expect(plan(["a\nb"], "\n", " ").rows[0].after).toBe("a b");
    expect(plan(["a\u0000b"], "\u0000", "0").rows[0].after).toBe("a0b");
    expect(plan(["ab"], "a", "\n​\u0000").rows[0].after).toBe("\n​\u0000b");
  });

  // 既知の制限（仕様 22.3 節）: 境界の単位はコードポイントで、書記素クラスタではない
  it("コードポイント単位で置換する（書記素クラスタは保たない）: ZWJ 絵文字の一部を置換できる", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}x";

    expect(plan([family], "\u{1F469}", "Y").rows[0].after).toBe("\u{1F468}‍Y‍\u{1F467}x");
  });

  it("コードポイント単位で置換する（書記素クラスタは保たない）: 国旗の片方だけを置換できる", () => {
    expect(plan(["\u{1F1EF}\u{1F1F5}"], "\u{1F1EF}", "Z").rows[0].after).toBe("Z\u{1F1F5}");
  });
});

describe("listLabelReplacements", () => {
  it("status が replace の行だけを nodeId → 置換後のラベルにし、emptied と unchanged は含めない", () => {
    // id 1: replace、id 2: emptied（置換後が空）、id 3: unchanged（置換前後が同じ）、id 4: 一致なし
    const nodes = ["abc", "a", "bab", "xyz"].map((label, index) => createTestNode({ id: index + 1, label }));
    const result = planLabelReplace(nodes, { query: "a", replacement: "", targetIds: null });
    expect(result.rows.map((row) => row.status)).toEqual(["replace", "emptied", "replace"]);

    expect(listLabelReplacements(result)).toEqual(new Map([[1, "bc"], [3, "bb"]]));
  });

  it("unchanged の行を含む計画でも除く", () => {
    const nodes = [createTestNode({ id: 1, label: "banana" })];
    const result = planLabelReplace(nodes, { query: "BANANA", replacement: "banana", targetIds: null });
    expect(result.rows.map((row) => row.status)).toEqual(["unchanged"]);

    expect(listLabelReplacements(result).size).toBe(0);
  });

  it("空の計画では空の Map を返す", () => {
    const result = planLabelReplace([createTestNode({ id: 1, label: "a" })], { query: "", replacement: "x", targetIds: null });

    expect(listLabelReplacements(result).size).toBe(0);
  });
});
