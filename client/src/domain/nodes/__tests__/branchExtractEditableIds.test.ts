import { listBranchExtractEditableIds } from "@/domain/nodes/branchExtractEditableIds";
import { createTestNode } from "@/testing/createTestNode";

describe("listBranchExtractEditableIds", () => {
  const nodes = [
    createTestNode({ id: 1, parentId: null, label: "ルート" }),
    createTestNode({ id: 2, parentId: 1, label: "枝" }),
    createTestNode({ id: 3, parentId: 2, label: "子" }),
  ];

  it("枝の部分木と、祖父がいるときは離脱元親を含める", () => {
    expect(listBranchExtractEditableIds(nodes, 3)).toEqual([3, 2]);
  });

  it("ルート直下の枝は親 id を含めない", () => {
    expect(listBranchExtractEditableIds(nodes, 2)).toEqual([2, 3]);
  });

  it("存在しない rootId なら空", () => {
    expect(listBranchExtractEditableIds(nodes, 99)).toEqual([]);
  });
});