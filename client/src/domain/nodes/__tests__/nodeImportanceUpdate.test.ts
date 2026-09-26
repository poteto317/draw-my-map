import { replaceNodeImportance } from "@/domain/nodes/nodeImportanceUpdate";
import { createTestNode } from "@/testing/createTestNode";

describe("replaceNodeImportance", () => {
  it("対象ノードだけを新しい重要度のノードへ置き換える", () => {
    const target = createTestNode({ id: 1, importance: "medium" });
    const other = createTestNode({ id: 2, importance: "low" });

    const result = replaceNodeImportance([target, other], 1, "high");

    expect(result).toEqual([
      { ...target, importance: "high" },
      other,
    ]);
    expect(result?.[0]).not.toBe(target);
    expect(result?.[1]).toBe(other);
  });

  it("対象ノードがない場合はnullを返す", () => {
    const nodes = [createTestNode({ id: 1 })];

    expect(replaceNodeImportance(nodes, 999, "high")).toBeNull();
  });
});
