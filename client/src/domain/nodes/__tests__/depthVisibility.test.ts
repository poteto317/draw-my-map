import {
  collectDepthVisibleNodeIds,
  measureNodeDepth,
  resolveDepthLimitForReveal,
} from "@/domain/nodes/depthVisibility";
import { createTestNode } from "@/testing/createTestNode";

describe("collectDepthVisibleNodeIds", () => {
  const nodes = [
    createTestNode({ id: 1, parentId: null }),
    createTestNode({ id: 2, parentId: 1 }),
    createTestNode({ id: 3, parentId: 2 }),
    createTestNode({ id: 4, parentId: null }),
  ];

  it("maxDepth が null のとき全 ID を返す", () => {
    expect([...collectDepthVisibleNodeIds(nodes, null)].sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4]);
  });

  it("深さ 0 はルートのみ（depth <= 0）", () => {
    expect([...collectDepthVisibleNodeIds(nodes, 0)].sort((a, b) => a - b))
      .toEqual([1, 4]);
  });

  it("深さ N は depth <= N のノードだけを返す", () => {
    expect([...collectDepthVisibleNodeIds(nodes, 1)].sort((a, b) => a - b))
      .toEqual([1, 2, 4]);
    expect([...collectDepthVisibleNodeIds(nodes, 2)].sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4]);
  });
});

describe("measureNodeDepth", () => {
  it("ルートは 0、子は親+1、不在は null", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null }),
      createTestNode({ id: 2, parentId: 1 }),
      createTestNode({ id: 3, parentId: 2 }),
    ];

    expect(measureNodeDepth(nodes, 1)).toBe(0);
    expect(measureNodeDepth(nodes, 2)).toBe(1);
    expect(measureNodeDepth(nodes, 3)).toBe(2);
    expect(measureNodeDepth(nodes, 99)).toBeNull();
  });
});

describe("resolveDepthLimitForReveal", () => {
  it("無制限または十分深いときは変更しない", () => {
    expect(resolveDepthLimitForReveal(null, 5)).toBeNull();
    expect(resolveDepthLimitForReveal(3, 2)).toBeNull();
    expect(resolveDepthLimitForReveal(2, 2)).toBeNull();
  });

  it("着地深さより浅い制限なら N を d へ引き上げる", () => {
    expect(resolveDepthLimitForReveal(1, 3)).toBe(3);
    expect(resolveDepthLimitForReveal(0, 1)).toBe(1);
  });
});
