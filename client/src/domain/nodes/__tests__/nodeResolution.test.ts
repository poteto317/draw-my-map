import {
  isNodeVisibleAtLevel,
  resolveMinimumVisibleLevel,
} from "@/domain/nodes/nodeResolution";

describe("node resolution", () => {
  it.each([
    ["high", "high", true],
    ["medium", "high", false],
    ["low", "high", false],
    ["high", "medium", true],
    ["medium", "medium", true],
    ["low", "medium", false],
    ["high", "all", true],
    ["medium", "all", true],
    ["low", "all", true],
  ] as const)("%sを%sで表示する=%s", (importance, level, expected) => {
    expect(isNodeVisibleAtLevel(importance, level)).toBe(expected);
  });

  it.each([
    ["high", "high", null],
    ["medium", "medium", "high"],
    ["low", "all", "medium"],
  ] as const)(
    "%sのノードが見える最も狭い段階は%sである",
    (importance, expectedLevel, narrowerLevel) => {
      const level = resolveMinimumVisibleLevel(importance);

      expect(level).toBe(expectedLevel);
      expect(isNodeVisibleAtLevel(importance, level)).toBe(true);
      if (narrowerLevel !== null) {
        expect(isNodeVisibleAtLevel(importance, narrowerLevel)).toBe(false);
      }
    },
  );
});
