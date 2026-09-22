import { getMapExportLabel, wrapMapExportText } from "../mapExportText";

const measure = (text: string) => Array.from(text).length * 10;

describe("wrapMapExportText", () => {
  it("keeps text on one line when it fits", () => {
    expect(wrapMapExportText("alpha", 60, measure)).toEqual(["alpha"]);
  });

  it("prefers whitespace when wrapping", () => {
    expect(wrapMapExportText("alpha beta", 60, measure)).toEqual(["alpha", "beta"]);
  });

  it("wraps Japanese text by Unicode code point when there is no whitespace", () => {
    expect(wrapMapExportText("あいうえ", 20, measure)).toEqual(["あい", "うえ"]);
  });

  it("splits a long Latin word when no whitespace is available", () => {
    expect(wrapMapExportText("abcdefgh", 30, measure)).toEqual(["abc", "def", "gh"]);
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
