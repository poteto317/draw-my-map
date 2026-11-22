import {
  clampLayoutSpacing,
  clampLayoutSpacingValue,
} from "@/components/layout/layoutSpacingClamp";

describe("clampLayoutSpacingValue", () => {
  it.each([
    [7, 8],
    [8, 8],
    [100, 100],
    [400, 400],
    [401, 400],
    [8.4, 8],
    [99.6, 100],
  ] as const)("%s を %s にクリップする", (input, expected) => {
    expect(clampLayoutSpacingValue(input)).toBe(expected);
  });
});

describe("clampLayoutSpacing", () => {
  it("各フィールドをクリップする", () => {
    expect(clampLayoutSpacing({ childGap: 3, siblingGap: 500 })).toEqual({
      childGap: 8,
      siblingGap: 400,
    });
  });
});