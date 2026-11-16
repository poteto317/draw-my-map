import { summarizeSelectionImportance } from "@/domain/nodes/selectionImportanceSummary";
import { createTestNode } from "@/testing/createTestNode";

describe("summarizeSelectionImportance", () => {
  const nodes = [
    createTestNode({ id: 1, importance: "high" }),
    createTestNode({ id: 2, importance: "high" }),
    createTestNode({ id: 3, importance: "low" }),
  ];

  it("対象が空ならnoneを返す", () => {
    expect(summarizeSelectionImportance(nodes, [])).toEqual({ kind: "none" });
  });

  it("全IDが不在ならnoneを返す", () => {
    expect(summarizeSelectionImportance(nodes, [998, 999])).toEqual({ kind: "none" });
  });

  it("全件が同じ重要度ならuniformと件数を返す", () => {
    expect(summarizeSelectionImportance(nodes, [1, 2])).toEqual({
      kind: "uniform",
      importance: "high",
      count: 2,
    });
  });

  it("1件だけならその重要度のuniformを返す", () => {
    expect(summarizeSelectionImportance(nodes, [3])).toEqual({
      kind: "uniform",
      importance: "low",
      count: 1,
    });
  });

  it("重要度が混在していればmixedと件数を返す", () => {
    expect(summarizeSelectionImportance(nodes, [1, 3])).toEqual({ kind: "mixed", count: 2 });
  });

  it("不在IDは件数に数えない", () => {
    expect(summarizeSelectionImportance(nodes, [1, 2, 999])).toEqual({
      kind: "uniform",
      importance: "high",
      count: 2,
    });
  });
});
