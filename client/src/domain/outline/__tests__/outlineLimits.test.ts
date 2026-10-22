import {
  isOutlineLineCountTooLarge,
  isOutlineTextLengthTooLong,
  isOutlineTextTooLong,
} from "../outlineLimits";

describe("isOutlineTextTooLong", () => {
  it("ちょうど1,000,000コード単位は受け付ける", () => {
    expect(isOutlineTextTooLong("a".repeat(1_000_000))).toBe(false);
  });

  it("1コード単位でも超えたら拒否する", () => {
    expect(isOutlineTextTooLong("a".repeat(1_000_001))).toBe(true);
  });

  it("コードポイントではなくUTF-16コード単位で数える", () => {
    expect(isOutlineTextTooLong("😀".repeat(500_000))).toBe(false);
    expect(isOutlineTextTooLong("😀".repeat(500_000) + "a")).toBe(true);
  });
});

describe("isOutlineTextLengthTooLong", () => {
  it("ちょうど1,000,000は受け付け、1でも超えたら拒否する", () => {
    expect(isOutlineTextLengthTooLong(1_000_000)).toBe(false);
    expect(isOutlineTextLengthTooLong(1_000_001)).toBe(true);
  });

  it("0は拒否しない", () => {
    expect(isOutlineTextLengthTooLong(0)).toBe(false);
  });
});

describe("isOutlineLineCountTooLarge", () => {
  it("ちょうど10,000行は受け付ける", () => {
    expect(isOutlineLineCountTooLarge(10_000)).toBe(false);
  });

  it("10,001行は拒否する", () => {
    expect(isOutlineLineCountTooLarge(10_001)).toBe(true);
  });

  it("0行は拒否しない", () => {
    expect(isOutlineLineCountTooLarge(0)).toBe(false);
  });
});
