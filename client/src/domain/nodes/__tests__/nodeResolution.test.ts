import { isNodeVisibleAtLevel } from "@/domain/nodes/nodeResolution";

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
});
