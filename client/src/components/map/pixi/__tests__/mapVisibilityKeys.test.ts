import {
  collectVisibleMapKeys,
  edgeVisibilityKey,
  nodeVisibilityKey,
} from "@/components/map/pixi/mapVisibilityKeys";
import { createTestNode } from "@/testing/createTestNode";

describe("mapVisibilityKeys", () => {
  it("nodeとedgeの安定したvisibility keyを生成する", () => {
    expect(nodeVisibilityKey(3)).toBe("node:3");
    expect(edgeVisibilityKey(3)).toBe("edge:3");
  });

  it("visible nodeと両端がvisibleなedgeのkeyを入力順で集める", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null }),
      createTestNode({ id: 2, parentId: 1 }),
      createTestNode({ id: 3, parentId: 2 }),
    ];

    expect([...collectVisibleMapKeys(nodes, new Set([1, 2]))]).toEqual([
      "node:1",
      "node:2",
      "edge:2",
    ]);
  });

  it("parentが存在しないedgeや非表示parentへ向かうedgeを含めない", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null }),
      createTestNode({ id: 2, parentId: 99 }),
      createTestNode({ id: 3, parentId: 1 }),
    ];

    expect([...collectVisibleMapKeys(nodes, new Set([2, 3]))]).toEqual([
      "node:2",
      "node:3",
    ]);
  });
});
