import {
  isBlankOutlineRest,
  measureOutlineIndent,
  normalizeOutlineRest,
  splitOutlineLines,
  splitOutlineText,
  stripOutlineBom,
} from "../outlineLines";

describe("splitOutlineText", () => {
  it("CRLF・CR・LFが混在していても改行ごとに分割する", () => {
    expect(splitOutlineText("A\r\nB\rC\nD")).toEqual(["A", "B", "C", "D"]);
  });

  it("CRLFを1つの改行として数え、空行を作らない", () => {
    expect(splitOutlineText("A\r\n\r\nB")).toEqual(["A", "", "B"]);
  });

  it("U+2028・U+2029・U+0085では分割しない", () => {
    expect(splitOutlineText("A\u0085B\u2028C\u2029D")).toHaveLength(1);
  });

  it("末尾の改行の後ろに空文字列の行ができる", () => {
    expect(splitOutlineText("A\n")).toEqual(["A", ""]);
  });

  it("少数派の改行の行が1つだけあっても、すべての改行で分割する", () => {
    expect(splitOutlineText("A\nB\nC\rD")).toEqual(["A", "B", "C", "D"]);
  });
});

describe("stripOutlineBom", () => {
  it("先頭のBOMを取り除く", () => {
    expect(stripOutlineBom("\uFEFFA")).toBe("A");
  });

  it("先頭以外のBOMは変えない", () => {
    expect(stripOutlineBom("A\uFEFF")).toBe("A\uFEFF");
  });

  it("先頭の1文字だけを取り除く", () => {
    expect(stripOutlineBom("\uFEFF\uFEFFA")).toBe("\uFEFFA");
  });
});

describe("measureOutlineIndent", () => {
  it("行頭のタブを数える", () => {
    expect(measureOutlineIndent("\t\tA")).toEqual({ tabs: 2, spaces: 0, rest: "A" });
  });

  it("半角スペースを1、全角スペースを2として数える", () => {
    expect(measureOutlineIndent("  A")).toEqual({ tabs: 0, spaces: 2, rest: "A" });
    expect(measureOutlineIndent("　　A")).toEqual({ tabs: 0, spaces: 4, rest: "A" });
  });

  it("タブと空白が混在していても順序によらず合計する", () => {
    expect(measureOutlineIndent(" \t　 A")).toEqual({ tabs: 1, spaces: 4, rest: "A" });
  });

  it("ノーブレークスペースはインデントに数えない", () => {
    expect(measureOutlineIndent("\u00A0A")).toEqual({
      tabs: 0,
      spaces: 0,
      rest: "\u00A0A",
    });
  });

  it("空白だけの行はすべてインデントとして数え、残りは空になる", () => {
    expect(measureOutlineIndent("   ")).toEqual({ tabs: 0, spaces: 3, rest: "" });
  });

  it("インデントの後の空白は残りに含める", () => {
    expect(measureOutlineIndent("A  B")).toEqual({ tabs: 0, spaces: 0, rest: "A  B" });
  });
});

describe("normalizeOutlineRest・isBlankOutlineRest", () => {
  it("タブと制御文字を半角空白へ置き換える", () => {
    expect(normalizeOutlineRest("A\tB")).toBe("A B");
    expect(normalizeOutlineRest("C\u0007D")).toBe("C D");
  });

  it("DEL（U+007F）だけの残りは空になる", () => {
    expect(normalizeOutlineRest("\u007F")).toBe("");
  });

  it("前後の空白を取り除く", () => {
    expect(normalizeOutlineRest("  A  ")).toBe("A");
  });

  it("制御文字だけの残りは空行とみなす", () => {
    expect(isBlankOutlineRest("\u0007")).toBe(true);
    expect(isBlankOutlineRest("\u007F")).toBe(true);
  });

  it("全角スペースだけの残りは空行とみなす", () => {
    expect(isBlankOutlineRest("　")).toBe(true);
  });

  it("ゼロ幅スペースは空行とみなさない", () => {
    expect(isBlankOutlineRest("\u200B")).toBe(false);
  });

  it("記号だけの残りは空行とみなさない", () => {
    expect(isBlankOutlineRest("-")).toBe(false);
  });
});

describe("splitOutlineLines", () => {
  it("空白だけの行を除き、元の行番号を保つ", () => {
    const lines = splitOutlineLines("A\n\n   \n  B");

    expect(lines).toEqual([
      { lineNumber: 1, tabs: 0, spaces: 0, rest: "A" },
      { lineNumber: 4, tabs: 0, spaces: 2, rest: "B" },
    ]);
  });

  it("先頭のBOMを先に除くので、インデントの測定がずれない", () => {
    const lines = splitOutlineLines("\uFEFF  A\n    B");

    expect(lines[0]).toEqual({ lineNumber: 1, tabs: 0, spaces: 2, rest: "A" });
    expect(lines[1]).toEqual({ lineNumber: 2, tabs: 0, spaces: 4, rest: "B" });
  });

  it("末尾の空行を無視する", () => {
    expect(splitOutlineLines("A\n")).toHaveLength(1);
  });

  it("空文字列は空配列を返す", () => {
    expect(splitOutlineLines("")).toEqual([]);
  });

  it("記号だけの行は数え、制御文字だけの行は数えない", () => {
    expect(splitOutlineLines("-\n\u0007\n*")).toHaveLength(2);
  });

  it("10,000行を入力の順に返す", () => {
    const lines = splitOutlineLines("A\n".repeat(10_000));

    expect(lines).toHaveLength(10_000);
    expect(lines[9_999].lineNumber).toBe(10_000);
  });

  describe("設計書の例", () => {
    it("例2: タブのインデント", () => {
      const lines = splitOutlineLines("仕事\n\t会議\n\t\t議事録");

      expect(lines.map((line) => [line.lineNumber, line.tabs, line.spaces])).toEqual([
        [1, 0, 0],
        [2, 1, 0],
        [3, 2, 0],
      ]);
    });

    it("例3: 全角スペースのインデント", () => {
      const lines = splitOutlineLines("旅行\n　持ち物\n　　パスポート");

      expect(lines.map((line) => [line.lineNumber, line.tabs, line.spaces])).toEqual([
        [1, 0, 0],
        [2, 0, 2],
        [3, 0, 4],
      ]);
    });

    it("例12: 改行コードの混在", () => {
      const lines = splitOutlineLines("A\r\n  B\r  C\nD");

      expect(lines.map((line) => [line.lineNumber, line.tabs, line.spaces])).toEqual([
        [1, 0, 0],
        [2, 0, 2],
        [3, 0, 2],
        [4, 0, 0],
      ]);
    });

    it("例13: 先頭のBOM", () => {
      const lines = splitOutlineLines("\uFEFF  A\n    B");

      expect(lines.map((line) => [line.lineNumber, line.tabs, line.spaces])).toEqual([
        [1, 0, 2],
        [2, 0, 4],
      ]);
    });

    it("例15: 空行と空白だけの行を除く", () => {
      const lines = splitOutlineLines("A\n\n   \n  B");

      expect(lines.map((line) => [line.lineNumber, line.tabs, line.spaces])).toEqual([
        [1, 0, 0],
        [4, 0, 2],
      ]);
    });

    it("例23: 空白・制御文字だけの行を行数に数えない", () => {
      const filler = ["", "   ", "\u0007", "　"];
      const rows: string[] = [];
      for (let i = 0; i < 10_000; i += 1) {
        rows.push("A");
        if (i < 100) rows.push(filler[i % filler.length]);
      }

      expect(splitOutlineLines(rows.join("\n"))).toHaveLength(10_000);
    });
  });
});
