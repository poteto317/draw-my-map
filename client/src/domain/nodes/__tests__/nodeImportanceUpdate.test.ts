import { replaceNodeImportance, replaceNodesImportance } from "@/domain/nodes/nodeImportanceUpdate";
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

describe("replaceNodesImportance", () => {
  it("指定した複数ノードだけを新しい重要度へ置き換え、選択外のノードは参照ごと保つ", () => {
    const high = createTestNode({ id: 1, importance: "high" });
    const medium = createTestNode({ id: 2, importance: "medium" });
    const untouched = createTestNode({ id: 3, importance: "medium" });

    const result = replaceNodesImportance([high, medium, untouched], [1, 2], "low");

    expect(result).toEqual([
      { ...high, importance: "low" },
      { ...medium, importance: "low" },
      untouched,
    ]);
    expect(result?.[2]).toBe(untouched);
  });

  it("すでに指定の重要度のノードは参照をそのまま返す", () => {
    const alreadyLow = createTestNode({ id: 1, importance: "low" });
    const high = createTestNode({ id: 2, importance: "high" });

    const result = replaceNodesImportance([alreadyLow, high], [1, 2], "low");

    expect(result?.[0]).toBe(alreadyLow);
    expect(result?.[1]).toEqual({ ...high, importance: "low" });
  });

  it("存在しないIDは無視し、存在するIDだけを置き換える", () => {
    const high = createTestNode({ id: 1, importance: "high" });
    const untouched = createTestNode({ id: 2, importance: "medium" });

    const result = replaceNodesImportance([high, untouched], [1, 999], "low");

    expect(result).toEqual([{ ...high, importance: "low" }, untouched]);
  });

  it.each([
    ["空配列", [] as number[]],
    ["全IDが不在", [998, 999]],
  ])("%sのときはnullを返す", (_name, ids) => {
    const nodes = [createTestNode({ id: 1, importance: "high" })];

    expect(replaceNodesImportance(nodes, ids, "low")).toBeNull();
  });
});
