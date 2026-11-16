import { replaceNodeLabels } from "@/domain/nodes/nodeLabelUpdate";
import { createTestNode } from "@/testing/createTestNode";

describe("replaceNodeLabels", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, label: "b" }),
    createTestNode({ id: 3, label: "c" }),
  ];

  it("指定したノードのラベルだけを置き換え、ほかのノードは参照ごと保つ", () => {
    const result = replaceNodeLabels(nodes, new Map([[1, "x"], [2, "y"]]));

    expect(result?.map((node) => node.label)).toEqual(["x", "y", "c"]);
    expect(result?.[2]).toBe(nodes[2]);
  });

  it("すでに同じラベルのノードは参照を保つ", () => {
    const result = replaceNodeLabels(nodes, new Map([[1, "a"], [2, "y"]]));

    expect(result?.[0]).toBe(nodes[0]);
    expect(result?.[1]).toEqual({ ...nodes[1], label: "y" });
  });

  it("存在しない ID は無視する", () => {
    const result = replaceNodeLabels(nodes, new Map([[1, "x"], [99, "z"]]));

    expect(result?.map((node) => node.label)).toEqual(["x", "b", "c"]);
  });

  it.each([
    ["空の Map", new Map<number, string>()],
    ["全 ID が不在", new Map([[98, "x"], [99, "y"]])],
  ])("%sなら null を返す", (_name, replacements) => {
    expect(replaceNodeLabels(nodes, replacements)).toBeNull();
  });
});
