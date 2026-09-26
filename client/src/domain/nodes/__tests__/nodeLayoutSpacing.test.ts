import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { hasValidVerticalSpacing } from "@/domain/nodes/nodeLayoutSpacing";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null = null, height = 60): Node {
  return createTestNode({ id, parentId, height, label: String(id) });
}

describe("hasValidVerticalSpacing", () => {
  describe.each([
    ["唯一のノード", [node(1)], 1],
    ["同じ深さの先頭ノード", [node(1), node(2)], 1],
    ["同じ深さの後続ノード", [node(1), node(2)], 2],
  ])("%sの位置を検証する", (_name, nodes, invalidId) => {
    it.each([
      ["位置なし", undefined],
      ["NaNのY", Number.NaN],
      ["正のInfinityのY", Number.POSITIVE_INFINITY],
      ["負のInfinityのY", Number.NEGATIVE_INFINITY],
    ])("%sならfalseを返す", (_case, invalidY) => {
      const forest = indexNodeForest(nodes)!;
      const positions = new Map([[1, { x: 0, y: 0 }], [2, { x: 0, y: 100 }]]);
      if (invalidY === undefined) positions.delete(invalidId);
      else positions.set(invalidId, { x: 0, y: invalidY });

      expect(hasValidVerticalSpacing(forest, positions)).toBe(false);
    });
  });

  it.each([
    ["正確なgap", 0, 100, true],
    ["実際の矩形重なり", 0, 59, false],
    ["数ULPの不足", 0, 99.99999999999999, true],
    ["意味のあるgap不足", 0, 99.999, false],
    ["大座標での意味のあるgap不足", 1e12, 1000000000099.9999, false],
  ])("%sを判定する", (_name, firstY, secondY, expected) => {
    const forest = indexNodeForest([node(1), node(2)])!;
    const positions = new Map([[1, { x: 0, y: firstY }], [2, { x: 0, y: secondY }]]);

    expect(hasValidVerticalSpacing(forest, positions)).toBe(expected);
  });

  it("大座標で加算が丸められた実gap32を拒否する", () => {
    const forest = indexNodeForest([node(1), node(2)])!;
    const firstY = 2 ** 57 - 48;
    const secondY = 2 ** 57 + 32;
    const positions = new Map([[1, { x: 0, y: firstY }], [2, { x: 0, y: secondY }]]);

    expect(secondY - (firstY + 60)).toBe(32);
    expect(hasValidVerticalSpacing(forest, positions)).toBe(false);
  });

  it.each([
    ["overflow", -1e308, 1e307, 1e308],
    ["正のbottomとの差のprecision saturation", 0, 60, Number.MAX_VALUE],
    ["負のbottomとの差のprecision saturation", -120, 60, Number.MAX_VALUE],
  ])("実gapの%sを拒否する", (_name, firstY, height, secondY) => {
    const forest = indexNodeForest([node(1, null, height), node(2)])!;
    const positions = new Map([[1, { x: 0, y: firstY }], [2, { x: 0, y: secondY }]]);

    expect(hasValidVerticalSpacing(forest, positions)).toBe(false);
  });

  it("各深さの最後のbottomを計算しない", () => {
    const forest = indexNodeForest([node(1), node(2), node(3, 2)])!;
    const positions = new Map([
      [1, { x: 0, y: -60 }],
      [2, { x: 0, y: Number.MAX_VALUE }],
      [3, { x: 220, y: Number.MAX_VALUE }],
    ]);

    expect(hasValidVerticalSpacing(forest, positions)).toBe(true);
  });

  it.each([
    ["bottomのprecision saturation", 2 ** 58, 1],
    ["gapのprecision saturation", 2 ** 60, 256],
  ])("比較に必要な%sを拒否する", (_name, firstY, height) => {
    const forest = indexNodeForest([node(1, null, height), node(2)])!;
    const positions = new Map([
      [1, { x: 0, y: firstY }],
      [2, { x: 0, y: Number.MAX_VALUE }],
    ]);

    expect(hasValidVerticalSpacing(forest, positions)).toBe(false);
  });
});
