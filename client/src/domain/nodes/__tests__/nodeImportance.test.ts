import {
  DEFAULT_NODE_IMPORTANCE,
  isNodeVisibleAtLevel,
} from "@/domain/nodes/nodeImportance";

describe("node importance", () => {
  it("新規ノード用の既定重要度はmedium", () => {
    expect(DEFAULT_NODE_IMPORTANCE).toBe("medium");
  });

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
