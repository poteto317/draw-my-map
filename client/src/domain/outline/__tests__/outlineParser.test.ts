import { extractOutlineLabel } from "@/domain/outline/outlineLabel";
import { splitOutlineLines } from "@/domain/outline/outlineLines";
import {
  parseOutlineText,
  type OutlineParseResult,
  type ParsedOutline,
} from "../outlineParser";

jest.mock("@/domain/outline/outlineLabel", () => {
  const actual = jest.requireActual("@/domain/outline/outlineLabel");
  return {
    ...actual,
    extractOutlineLabel: jest.fn(actual.extractOutlineLabel),
  };
});

jest.mock("@/domain/outline/outlineLines", () => {
  const actual = jest.requireActual("@/domain/outline/outlineLines");
  return {
    ...actual,
    splitOutlineLines: jest.fn(actual.splitOutlineLines),
  };
});

// 成功の結果を取り出す。失敗ならテストを落とす。
function parsed(text: string): ParsedOutline {
  const result = parseOutlineText(text);
  if (!result.ok) {
    throw new Error(`解析に失敗しました: ${JSON.stringify(result.error)}`);
  }
  return result.outline;
}

// items の parentIndex だけから「親>子」の入れ子の文字列を組み立てる。
// 子が1件なら「親>子」、2件以上なら「親>(子1,子2)」、ルートは「,」で並べる。
function toTree(outline: ParsedOutline): string {
  const children: number[][] = outline.items.map(() => []);
  const roots: number[] = [];
  outline.items.forEach((item, index) => {
    if (item.parentIndex === null) {
      roots.push(index);
    } else {
      children[item.parentIndex].push(index);
    }
  });

  function render(index: number): string {
    const label = outline.items[index].label;
    const childIndexes = children[index];
    if (childIndexes.length === 0) return label;
    if (childIndexes.length === 1) return `${label}>${render(childIndexes[0])}`;
    return `${label}>(${childIndexes.map(render).join(",")})`;
  }

  return roots.map(render).join(",");
}

// 木・ルート数・ノード数・警告をまとめて確かめる。
function expectOutline(
  text: string,
  expected: {
    tree: string;
    rootCount: number;
    itemCount: number;
    warnings: ParsedOutline["warnings"];
  },
): void {
  const outline = parsed(text);
  expect(toTree(outline)).toBe(expected.tree);
  expect(outline.rootCount).toBe(expected.rootCount);
  expect(outline.items).toHaveLength(expected.itemCount);
  expect(outline.warnings).toEqual(expected.warnings);
}

// 例23: A を10,000行。100行ごとに、空行・空白だけ・制御文字だけ・全角スペースだけの行を1行はさむ。
function example23Lines(): string[] {
  const blanks = ["", "   ", "\u0007", "\u3000"];
  const lines: string[] = [];
  for (let index = 0; index < 10_000; index += 1) {
    lines.push("A");
    if (index % 100 === 99) lines.push(blanks[(index - 99) / 100 % 4]);
  }
  return lines;
}

describe("parseOutlineText", () => {
  describe("設計書の例", () => {
    it("例1: 記号付きの2段の箇条書き", () => {
      expectOutline("- 果物\n  - りんご\n  - みかん\n- 野菜", {
        tree: "果物>(りんご,みかん),野菜",
        rootCount: 2,
        itemCount: 4,
        warnings: [],
      });
    });

    it("例2: タブのインデント", () => {
      expectOutline("仕事\n\t会議\n\t\t議事録", {
        tree: "仕事>会議>議事録",
        rootCount: 1,
        itemCount: 3,
        warnings: [],
      });
    });

    it("例3: 全角スペースのインデント", () => {
      expectOutline("旅行\n\u3000持ち物\n\u3000\u3000パスポート", {
        tree: "旅行>持ち物>パスポート",
        rootCount: 1,
        itemCount: 3,
        warnings: [],
      });
    });

    it("例4: 番号の除去と幅3のインデント", () => {
      expectOutline("1. 準備\n2) 実行\n   1. 手順A", {
        tree: "準備,実行>手順A",
        rootCount: 2,
        itemCount: 3,
        warnings: [],
      });
    });

    it("例5: 後ろに空白の無い中黒と•", () => {
      expectOutline("・朝\n  •昼", {
        tree: "朝>昼",
        rootCount: 1,
        itemCount: 2,
        warnings: [],
      });
    });

    it("例6: 記号として扱わない先頭の文字と、記号を1つだけ除くこと", () => {
      expectOutline("-5度\n3.14\n# 見出し\n*注意*\n- 1. 手順", {
        tree: "-5度,3.14,# 見出し,*注意*,1. 手順",
        rootCount: 5,
        itemCount: 5,
        warnings: [],
      });
    });

    it("例7: 記号だけの行は取り込まずに警告する", () => {
      expectOutline("-\n- a\n  1.", {
        tree: "a",
        rootCount: 1,
        itemCount: 1,
        warnings: [{ kind: "empty-label", count: 2, lineNumbers: [1, 3] }],
      });
    });

    it("例8: 標準の幅より深い行を1段に丸める", () => {
      expectOutline("A\n  B\n      C\n  D", {
        tree: "A>(B>C,D)",
        rootCount: 1,
        itemCount: 4,
        warnings: [{ kind: "depth-adjusted", count: 1, lineNumbers: [3] }],
      });
    });

    it("例9: 段の間の浅さの行を浅い段に揃える", () => {
      expectOutline("A\n    B\n  C", {
        tree: "A>B,C",
        rootCount: 2,
        itemCount: 3,
        warnings: [{ kind: "depth-adjusted", count: 1, lineNumbers: [3] }],
      });
    });

    it("例10: 1行目のインデントは0段として扱う", () => {
      expectOutline("  - a\n    - b\n  - c", {
        tree: "a>b,c",
        rootCount: 2,
        itemCount: 3,
        warnings: [],
      });
    });

    it("例11: 最初の段より浅い行を深さ0の段に揃える", () => {
      expectOutline("    A\n    B\n  C\nD", {
        tree: "A,B,C,D",
        rootCount: 4,
        itemCount: 4,
        warnings: [{ kind: "depth-adjusted", count: 2, lineNumbers: [3, 4] }],
      });
    });

    it("例12: CRLF・CR・LF の混在", () => {
      expectOutline("A\r\n  B\r  C\nD", {
        tree: "A>(B,C),D",
        rootCount: 2,
        itemCount: 4,
        warnings: [],
      });
    });

    it("例13: 先頭の BOM を除いてからインデントを測る", () => {
      expectOutline("\uFEFF  A\n    B", {
        tree: "A>B",
        rootCount: 1,
        itemCount: 2,
        warnings: [],
      });
    });

    it("例14: タブを標準の幅に換算する", () => {
      expectOutline("A\n\tB\n    C", {
        tree: "A>(B,C)",
        rootCount: 1,
        itemCount: 3,
        warnings: [],
      });
    });

    it("例15: 空行と空白だけの行を無視する", () => {
      expectOutline("A\n\n   \n  B", {
        tree: "A>B",
        rootCount: 1,
        itemCount: 2,
        warnings: [],
      });
    });

    it("例16: ラベルの中のタブと制御文字を半角空白にする", () => {
      expectOutline("A\tB\nC\u0007D", {
        tree: "A B,C D",
        rootCount: 2,
        itemCount: 2,
        warnings: [],
      });
    });

    it("例17: 200コードポイントを超える行に警告する", () => {
      const line200 = "😀" + "あ".repeat(199);
      const line201 = "😀" + "あ".repeat(200);
      expectOutline(`${line200}\n${line201}`, {
        tree: `${line200},${line201}`,
        rootCount: 2,
        itemCount: 2,
        warnings: [{ kind: "long-label", count: 1, lineNumbers: [2] }],
      });
    });

    it("例18: 3段深いタブの行を1段に丸めて警告する", () => {
      expectOutline("A\n\t\t\tB", {
        tree: "A>B",
        rootCount: 1,
        itemCount: 2,
        warnings: [{ kind: "depth-adjusted", count: 1, lineNumbers: [2] }],
      });
    });

    it("例19: 取り込める行が無ければ no-items", () => {
      expect(parseOutlineText("")).toEqual({
        ok: false,
        error: { kind: "no-items" },
      });
      expect(parseOutlineText("-\n*")).toEqual({
        ok: false,
        error: { kind: "no-items" },
      });
    });

    it("例20: ゼロ幅スペースだけの行は1つのノードになる", () => {
      expectOutline("\u200B", {
        tree: "\u200B",
        rootCount: 1,
        itemCount: 1,
        warnings: [],
      });
    });

    it("例21: 標準の幅より浅い増分の行を1段深くして警告する", () => {
      expectOutline("A\n  B\n   C", {
        tree: "A>B>C",
        rootCount: 1,
        itemCount: 3,
        warnings: [{ kind: "depth-adjusted", count: 1, lineNumbers: [3] }],
      });
    });

    it("例22: 揃えた値の後に続く同じインデントの行は兄弟になる", () => {
      expectOutline("A\n    B\n  C\n  D\nE", {
        tree: "A>B,C,D,E",
        rootCount: 4,
        itemCount: 5,
        warnings: [{ kind: "depth-adjusted", count: 1, lineNumbers: [3] }],
      });
    });

    it("例23: 空行を行数に数えず、10,000行ちょうどを受け付ける", () => {
      const lines = example23Lines();
      expect(lines).toHaveLength(10_100);
      expect(lines.filter((line) => line === "")).toHaveLength(25);
      expect(lines.filter((line) => line === "   ")).toHaveLength(25);
      expect(lines.filter((line) => line === "\u0007")).toHaveLength(25);
      expect(lines.filter((line) => line === "\u3000")).toHaveLength(25);

      const outline = parsed(lines.join("\n"));
      expect(outline.items).toHaveLength(10_000);
      expect(outline.rootCount).toBe(10_000);
      expect(outline.items.every((item) => item.label === "A")).toBe(true);
      expect(outline.warnings).toEqual([]);
    });

    it("例24: 記号だけの行を行数に数え、10,001行で too-many-lines", () => {
      const text = [...example23Lines(), "-"].join("\n");
      expect(parseOutlineText(text)).toEqual({
        ok: false,
        error: { kind: "too-many-lines", lines: 10_001 },
      });
    });

    it("例25: 10,001行で too-many-lines", () => {
      expect(parseOutlineText("A\n".repeat(10_001))).toEqual({
        ok: false,
        error: { kind: "too-many-lines", lines: 10_001 },
      });
    });
  });

  describe("行数の上限と、空行・記号だけの行の数え方", () => {
    it("記号だけの行は行数に数え、ノードにせず empty-label の警告にする", () => {
      const lines = Array.from({ length: 9_999 }, () => "A");
      lines.push("-");
      const outline = parsed(lines.join("\n"));
      expect(outline.items).toHaveLength(9_999);
      expect(outline.items.some((item) => item.label === "-")).toBe(false);
      expect(outline.warnings).toEqual([
        { kind: "empty-label", count: 1, lineNumbers: [10_000] },
      ]);

      lines.push("A");
      expect(parseOutlineText(lines.join("\n"))).toEqual({
        ok: false,
        error: { kind: "too-many-lines", lines: 10_001 },
      });
    });

    it("空行（空白・制御文字だけの行）は行数に数えない", () => {
      const lines = Array.from({ length: 10_000 }, () => "A");
      lines.push("", "   ", "\u0007", "\u3000", "\t");
      const outline = parsed(lines.join("\n"));
      expect(outline.items).toHaveLength(10_000);
      expect(outline.warnings).toEqual([]);
    });
  });

  describe("長いラベル", () => {
    it("200コードポイントちょうどの行は警告しない", () => {
      const line199 = "😀" + "あ".repeat(198);
      const line200 = "😀" + "あ".repeat(199);
      expect(line200.length).toBe(201);
      const outline = parsed(`${line199}\n${line200}`);
      expect(outline.items).toHaveLength(2);
      expect(outline.warnings).toEqual([]);
    });
  });

  describe("文字数の上限", () => {
    it("1,000,000文字ちょうどは受け付け、1,000,001文字は too-long", () => {
      const accepted = parsed("a".repeat(1_000_000));
      expect(accepted.items).toHaveLength(1);

      expect(parseOutlineText("a".repeat(1_000_001))).toEqual({
        ok: false,
        error: { kind: "too-long", length: 1_000_001 },
      });
    });

    it("BOM を除く前の文字列で数える", () => {
      const accepted = parsed("\uFEFF" + "a".repeat(999_999));
      expect(accepted.items).toHaveLength(1);

      expect(parseOutlineText("\uFEFF" + "a".repeat(1_000_000))).toEqual({
        ok: false,
        error: { kind: "too-long", length: 1_000_001 },
      });
    });
  });

  describe("改行コード", () => {
    it("例1 を LF・CRLF・CR・混在で書いても同じ items になる", () => {
      const lines = ["- 果物", "  - りんご", "  - みかん", "- 野菜"];
      const lf = parsed(lines.join("\n")).items;
      expect(parsed(lines.join("\r\n")).items).toEqual(lf);
      expect(parsed(lines.join("\r")).items).toEqual(lf);
      expect(
        parsed(`${lines[0]}\r\n${lines[1]}\r${lines[2]}\n${lines[3]}`).items,
      ).toEqual(lf);
    });
  });

  describe("判定の順序", () => {
    beforeEach(() => {
      jest.mocked(extractOutlineLabel).mockClear();
      jest.mocked(splitOutlineLines).mockClear();
    });

    it("行数の超過ではラベルを取り出さない", () => {
      const result = parseOutlineText("A\n".repeat(10_001));
      expect(result.ok).toBe(false);
      expect(jest.mocked(splitOutlineLines)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(extractOutlineLabel)).not.toHaveBeenCalled();
    });

    it("文字数の超過では行を分割しない", () => {
      const result = parseOutlineText("a".repeat(1_000_001));
      expect(result.ok).toBe(false);
      expect(jest.mocked(splitOutlineLines)).not.toHaveBeenCalled();
      expect(jest.mocked(extractOutlineLabel)).not.toHaveBeenCalled();
    });

    it("上限の内側ではすべての空行でない行のラベルを取り出す", () => {
      parseOutlineText("A\n\n-\n  B");
      expect(jest.mocked(extractOutlineLabel)).toHaveBeenCalledTimes(3);
    });
  });

  describe("警告の集計", () => {
    it("行番号は昇順の先頭5件まで、件数はすべて数える", () => {
      const lines: string[] = [];
      for (let index = 0; index < 7; index += 1) lines.push("A", "-");
      const outline = parsed(lines.join("\n"));
      expect(outline.warnings).toEqual([
        { kind: "empty-label", count: 7, lineNumbers: [2, 4, 6, 8, 10] },
      ]);
    });

    it("種類の順は depth-adjusted、empty-label、long-label で固定する", () => {
      const long = "あ".repeat(201);
      const outline = parsed(`${long}\n-\nA\n\t\t\tB`);
      expect(outline.warnings).toEqual([
        { kind: "depth-adjusted", count: 1, lineNumbers: [4] },
        { kind: "empty-label", count: 1, lineNumbers: [2] },
        { kind: "long-label", count: 1, lineNumbers: [1] },
      ]);
    });
  });

  describe("結果の値", () => {
    it("rootCount と maxDepth（例1・例2）", () => {
      const example1 = parsed("- 果物\n  - りんご\n  - みかん\n- 野菜");
      expect(example1.rootCount).toBe(2);
      expect(example1.maxDepth).toBe(1);

      const example2 = parsed("仕事\n\t会議\n\t\t議事録");
      expect(example2.rootCount).toBe(1);
      expect(example2.maxDepth).toBe(2);
    });

    it("items に行番号・深さ・親の添字を入れる", () => {
      expect(parsed("A\n\n  B\n-\n  C").items).toEqual([
        { label: "A", depth: 0, parentIndex: null, lineNumber: 1 },
        { label: "B", depth: 1, parentIndex: 0, lineNumber: 3 },
        { label: "C", depth: 1, parentIndex: 0, lineNumber: 5 },
      ]);
    });

    it("入力を変えず、2回呼んでも同じ結果になる", () => {
      const text = "\uFEFF- 果物\r\n  - りんご\n-\n  - みかん";
      const before = `${text}`;
      const first: OutlineParseResult = parseOutlineText(text);
      expect(text).toBe(before);
      expect(parseOutlineText(text)).toEqual(first);
    });
  });

  describe("計算量", () => {
    // 1段ごとにインデントの文字が1つ増えるので、10,000段の鎖は文字数の上限（1,000,000）を
    // 超えて入力できない。上限に収まる最も深い鎖（タブで1,412段）を解析する。
    // 10,000段の鎖の計算量は outlineHierarchy のテストで確かめている。
    function tabChain(depth: number): string {
      const lines: string[] = [];
      for (let index = 0; index < depth; index += 1) {
        lines.push("\t".repeat(index) + "A");
      }
      return lines.join("\n");
    }

    it("文字数の上限に収まる最も深い鎖を例外なく解析する", () => {
      const text = tabChain(1_412);
      expect(text.length).toBeLessThanOrEqual(1_000_000);
      expect(tabChain(1_413).length).toBeGreaterThan(1_000_000);

      const outline = parsed(text);
      expect(outline.items).toHaveLength(1_412);
      expect(outline.maxDepth).toBe(1_411);
      expect(outline.rootCount).toBe(1);
      expect(outline.warnings).toEqual([]);
    });

    it("10,000件の兄弟を解析する", () => {
      const outline = parsed(Array.from({ length: 10_000 }, () => "A").join("\n"));
      expect(outline.rootCount).toBe(10_000);
      expect(outline.maxDepth).toBe(0);
    });
  });
});
