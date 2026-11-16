import {
  DEFAULT_NODE_IMPORTANCE,
  IMPORTANCE_RANK,
  maxNodeImportance,
} from "@/domain/nodes/nodeImportance";
import type { NodeImportance } from "@/types/nodeImportance";

describe("IMPORTANCE_RANK", () => {
  it("重要度の序列を high 2・medium 1・low 0 に固定する（解像度フィルターと統合が同じ表を使う）", () => {
    expect(IMPORTANCE_RANK).toEqual({ high: 2, medium: 1, low: 0 });
  });
});

describe("maxNodeImportance", () => {
  it.each<[NodeImportance[], NodeImportance]>([
    [["low", "medium", "high"], "high"],
    [["high", "medium"], "high"],
    [["medium", "low"], "medium"],
    [["low", "low"], "low"],
    [["low"], "low"],
  ])("%j のうち最も高い重要度は %s", (values, expected) => {
    expect(maxNodeImportance(values)).toBe(expected);
  });

  it("空の配列は既定の重要度を返す", () => {
    expect(maxNodeImportance([])).toBe(DEFAULT_NODE_IMPORTANCE);
  });
});
