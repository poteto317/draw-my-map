import {
  getMapExportLabel,
  getMapExportTextLayout,
  wrapMapExportText,
} from "../mapExportText";

const measure = (text: string) => Array.from(text).length * 10;

describe("wrapMapExportText", () => {
  it.each([-6, 0, 5])("finishes narrow text at width %s without adding empty lines", (maxWidth) => {
    let measurements = 0;
    const boundedMeasure = (text: string) => {
      // Stop a regression from hanging Jest after all code points are consumed.
      if (++measurements > 100) throw new Error("Text wrapping did not terminate");
      return measure(text);
    };

    expect(wrapMapExportText("A😀\n\nB", maxWidth, boundedMeasure))
      .toEqual(["A", "😀", "", "B"]);
  });

  it("keeps text on one line when it fits", () => {
    expect(wrapMapExportText("alpha", 60, measure)).toEqual(["alpha"]);
  });

  it("幅内の前後・連続空白を保持する", () => {
    expect(wrapMapExportText("  A  B  ", 100, measure)).toEqual(["  A  B  "]);
  });

  it("prefers whitespace when wrapping", () => {
    expect(wrapMapExportText("alpha beta", 60, measure)).toEqual(["alpha", "beta"]);
  });

  it.each([
    [20, ["A", " B"]],
    [30, ["A ", "B"]],
  ] as const)("幅%sのソフト改行では採用した空白だけを除去する", (maxWidth, expected) => {
    expect(wrapMapExportText("A  B", maxWidth, measure)).toEqual(expected);
  });

  it("does not add an empty line when a soft break starts at leading whitespace", () => {
    expect(wrapMapExportText(" abc", 20, measure)).toEqual(["ab", "c"]);
  });

  it("wraps Japanese text by Unicode code point when there is no whitespace", () => {
    expect(wrapMapExportText("あいうえ", 20, measure)).toEqual(["あい", "うえ"]);
  });

  it("splits a long Latin word when no whitespace is available", () => {
    expect(wrapMapExportText("abcdefgh", 30, measure)).toEqual(["abc", "def", "gh"]);
  });

  it("長いラベルを折り返しても測定対象の総文字数が入力長に比例する", () => {
    const label = "a".repeat(1_000);
    let measuredCharacters = 0;
    const boundedMeasure = (text: string) => {
      const length = Array.from(text).length;
      measuredCharacters += length;
      return length * 10;
    };
    const lines = wrapMapExportText(label, 10, boundedMeasure);

    expect(lines).toHaveLength(1_000);
    expect(lines.join("")).toBe(label);
    expect(measuredCharacters).toBeLessThanOrEqual(label.length * 4);
  });

  it("normalizes CRLF and preserves explicit blank lines", () => {
    expect(wrapMapExportText("A\r\n\r\nB", 100, measure)).toEqual(["A", "", "B"]);
  });
});

describe("getMapExportLabel", () => {
  it("uses the fallback label for an empty label", () => {
    expect(getMapExportLabel("")).toBe("新しいノード");
  });
});

describe("getMapExportTextLayout", () => {
  it("複数行全体の描画範囲と先頭baselineを中央基準で計算する", () => {
    const layout = getMapExportTextLayout("A\nLongest\nB", 100, 50, measure);

    expect(layout).toMatchObject({
      lines: ["A", "Longest", "B"],
      top: 23,
      bottom: 77,
      width: 70,
    });
    expect(layout.firstBaseline).toBeCloseTo(36.66666666666667);
  });
});
