import {
  getMapExportLabel,
  getMapExportTextLayout,
  wrapMapExportText,
} from "../mapExportText";

const measure = (text: string) => Array.from(text).length * 10;
// W だけが広いと、上限より広い1文字を行の途中に置ける。
const createMeasureWithWideW = () => {
  let measurements = 0;
  return (text: string) => {
    // 行が前へ進まない退行でも、Jest を止めずに失敗させる。
    if (++measurements > 100) throw new Error("Text wrapping did not terminate");
    return Array.from(text).reduce(
      (width, codePoint) => width + (codePoint === "W" ? 50 : 10),
      0,
    );
  };
};

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

  it("公開入口でXML禁止文字を正規化してから測定する", () => {
    const measuredTexts: string[] = [];
    const recordingMeasure = (text: string) => {
      measuredTexts.push(text);
      return measure(text);
    };

    expect(wrapMapExportText("A\u0000B", 100, recordingMeasure))
      .toEqual(["A\uFFFDB"]);
    expect(measuredTexts).not.toContainEqual(expect.stringContaining("\u0000"));
  });

  it("幅内の前後・連続空白を保持する", () => {
    expect(wrapMapExportText("  A  B  ", 100, measure)).toEqual(["  A  B  "]);
  });

  it.each([
    ["A ", 10, ["A", " "]],
    ["A  ", 10, ["A", " ", " "]],
    ["A  ", 20, ["A ", " "]],
  ] as const)(
    "幅境界を超えた末尾空白を保持する: %p / 幅%s",
    (label, maxWidth, expected) => {
      expect(wrapMapExportText(label, maxWidth, measure)).toEqual(expected);
    },
  );

  it("prefers whitespace when wrapping", () => {
    expect(wrapMapExportText("alpha beta", 60, measure)).toEqual(["alpha", "beta"]);
  });

  it.each([
    [10, ["A", " ", "B"]],
    [20, ["A", " B"]],
    [30, ["A ", "B"]],
  ] as const)("幅%sのソフト改行では採用した空白だけを除去する", (maxWidth, expected) => {
    expect(wrapMapExportText("A  B", maxWidth, measure)).toEqual(expected);
  });

  it.each([
    ["A   B", ["A", "  ", "B"]],
    ["    A", [" ", "  ", "A"]],
  ] as const)(
    "同じ連続空白から除去するソフト改行文字は1文字だけにする: %p",
    (label, expected) => {
      expect(wrapMapExportText(label, 20, measure)).toEqual(expected);
    },
  );

  it("先頭の連続空白でもソフト改行に採用した1文字だけを除去する", () => {
    expect(wrapMapExportText("  A", 10, measure)).toEqual([" ", "A"]);
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

  it("幅がない大量文字でも引数上限に依存せず1文字ずつ折り返す", () => {
    const label = "a".repeat(200_000);
    const lines = wrapMapExportText(label, 0, measure);

    expect(lines).toHaveLength(label.length);
    expect(lines.join("")).toBe(label);
  });

  it("normalizes CRLF and preserves explicit blank lines", () => {
    expect(wrapMapExportText("A\r\n\r\nB", 100, measure)).toEqual(["A", "", "B"]);
  });

  it.each([
    ["", [""]],
    ["A\rB", ["A", "B"]],
    ["A\n\rB", ["A", "", "B"]],
    ["\nA\n", ["", "A", ""]],
  ] as const)("単独のCRと先頭・末尾の空行を明示的な改行として扱う: %j", (label, expected) => {
    expect(wrapMapExportText(label, 100, measure)).toEqual(expected);
  });

  it.each([0, -1])("幅%sでは測定せずに空白も1コードポイントずつ行にする", (maxWidth) => {
    // 幅0の文字として測れても、幅の判定へ進まないことを確かめる。
    const zeroWidthMeasure = jest.fn(() => 0);

    expect(wrapMapExportText("a b", maxWidth, zeroWidthMeasure))
      .toEqual(["a", " ", "b"]);
    expect(zeroWidthMeasure).not.toHaveBeenCalled();
  });

  it("上限より広い1文字は行の途中でも単独の行にして前へ進む", () => {
    expect(wrapMapExportText("aWa", 30, createMeasureWithWideW())).toEqual(["a", "W", "a"]);
  });

  it("上限より広い文字の直後の空白はソフト改行に使わず次の行の先頭に残す", () => {
    expect(wrapMapExportText("W B C", 20, createMeasureWithWideW()))
      .toEqual(["W", " B", "C"]);
  });

  it("空白だけの行の直後の空白はソフト改行として除去しない", () => {
    expect(wrapMapExportText("W    B", 10, createMeasureWithWideW()))
      .toEqual(["W", " ", " ", " ", " ", "B"]);
  });

  it("幅に収まる範囲に空白が複数あれば最後の空白で折り返す", () => {
    expect(wrapMapExportText("a b c d", 50, measure)).toEqual(["a b", "c d"]);
  });

  it("2行目以降でも幅に収まる範囲の空白で折り返す", () => {
    expect(wrapMapExportText("aa bb cc", 40, measure)).toEqual(["aa", "bb", "cc"]);
  });

  it("語がちょうど収まった直後の空白1文字を除去する", () => {
    expect(wrapMapExportText("ab cd", 20, measure)).toEqual(["ab", "cd"]);
  });

  it("語がちょうど収まった直後の連続空白は1文字だけ除去する", () => {
    expect(wrapMapExportText("AB    C", 20, measure)).toEqual(["AB", "  ", " C"]);
  });

  it("語がちょうど収まった直後の末尾の空白を除去しない", () => {
    expect(wrapMapExportText("AB  ", 20, measure)).toEqual(["AB", "  "]);
  });

  it("空白だけの行は除去せずに幅で分ける", () => {
    expect(wrapMapExportText("   ", 20, measure)).toEqual(["  ", " "]);
  });

  it("連続空白の除去の状態を明示的な改行の次の行へ持ち越さない", () => {
    expect(wrapMapExportText("A   B\nC   D", 20, measure))
      .toEqual(["A", "  ", "B", "C", "  ", "D"]);
  });

  it("サロゲートペアを分割せずに幅で折り返す", () => {
    const measuredTexts: string[] = [];
    const recordingMeasure = (text: string) => {
      measuredTexts.push(text);
      return measure(text);
    };

    expect(wrapMapExportText("😀😀😀", 20, recordingMeasure))
      .toEqual(["😀😀", "😀"]);
    expect(measuredTexts).not.toContainEqual(expect.stringMatching(/\p{Cs}/u));
  });

  it("サロゲートペアの間の空白で折り返す", () => {
    expect(wrapMapExportText("😀 😀😀", 30, measure)).toEqual(["😀", "😀😀"]);
  });
});

describe("getMapExportLabel", () => {
  it("uses the fallback label for an empty label", () => {
    expect(getMapExportLabel("")).toBe("新しいノード");
  });
});

describe("getMapExportTextLayout", () => {
  it("XML禁止文字を置換後の文字幅で描画範囲を計算する", () => {
    const replacementAwareMeasure = (text: string) => (
      Array.from(text).reduce(
        (width, codePoint) => width + (codePoint === "\uFFFD" ? 80 : 10),
        0,
      )
    );

    expect(getMapExportTextLayout("A\u0000B", 200, 50, replacementAwareMeasure))
      .toMatchObject({
        lines: ["A\uFFFDB"],
        width: 100,
      });
  });

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

  it("大量の折り返し行でも引数上限に依存せず最大幅を計算する", () => {
    const lineCount = 200_000;
    const layout = getMapExportTextLayout(
      Array.from({ length: lineCount }, () => "A").join("\n"),
      100,
      0,
      measure,
    );

    expect(layout.lines).toHaveLength(lineCount);
    expect(layout.width).toBe(10);
  });
});
