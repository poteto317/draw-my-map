import { layoutContextFromState } from "@/domain/nodes/nodeMapLayoutContext";
import type { NodeMapState } from "@/types/nodeMapState";
import { createTestNode } from "@/testing/createTestNode";

describe("layoutContextFromState", () => {
  it("配置コンテキストだけを抜き出す", () => {
    const state: NodeMapState = {
      layoutMode: "auto",
      nodes: [createTestNode({ id: 1, label: "a" })],
      treeDirection: "tb",
      layoutSpacing: { childGap: 40, siblingGap: 12 },
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
      relations: [],
      groups: [],
    };

    expect(layoutContextFromState(state)).toEqual({
      treeDirection: "tb",
      layoutSpacing: { childGap: 40, siblingGap: 12 },
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    });
  });
});
