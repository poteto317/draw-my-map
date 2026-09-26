import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { calculateNodeLayoutMetrics } from "@/domain/nodes/nodeLayoutMetrics";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null, width = 100, height = 60, x = 80): Node {
  return createTestNode({ id, parentId, width, height, x, label: String(id) });
}

describe("calculateNodeLayoutMetrics", () => {
  it("大座標で列の実gapが112へ丸められる寸法計算を拒否する", () => {
    const forest = indexNodeForest([node(1, null, 112, 60, 2 ** 56), node(2, 1)])!;

    expect(calculateNodeLayoutMetrics(forest)).toBeNull();
  });

  it("各深さの最大幅から全ルート共通の列を求める", () => {
    const forest = indexNodeForest([
      node(1, null, 140), node(2, 1, 80), node(3, 2), node(4, 1, 200),
      node(9, null, 100, 60, 900),
    ])!;

    expect(calculateNodeLayoutMetrics(forest)?.columnX).toEqual([80, 340, 660]);
  });

  it("子孫のspanと兄弟間gapを集計し、親自身が高い場合も含める", () => {
    const forest = indexNodeForest([
      node(1, null), node(2, 1, 100, 200), node(3, 1), node(4, 3, 100, 90),
    ])!;
    const metrics = calculateNodeLayoutMetrics(forest);

    expect(metrics?.spanById).toEqual(new Map([[2, 200], [4, 90], [3, 90], [1, 330]]));
    expect(metrics?.childrenHeightById).toEqual(new Map([[2, 0], [4, 0], [3, 90], [1, 330]]));
  });

  it.each([
    ["列のoverflow", [node(1, null, Number.MAX_VALUE, 60, Number.MAX_VALUE), node(2, 1)]],
    ["列のprecision saturation", [node(1, null, 1, 60, 2 ** 58), node(2, 1)]],
    ["列gapのprecision saturation", [node(1, null, 256, 60, 2 ** 60), node(2, 1)]],
    ["spanのoverflow", [node(1, null), node(2, 1, 100, Number.MAX_VALUE), node(3, 1, 100, Number.MAX_VALUE)]],
    ["spanのprecision saturation", [node(1, null), node(2, 1, 100, 2 ** 58), node(3, 1, 100, 1)]],
    ["兄弟gapのprecision saturation", [node(1, null), node(2, 1, 100, 2 ** 60), node(3, 1, 100, 256)]],
  ])("%sを拒否する", (_name, nodes) => {
    expect(calculateNodeLayoutMetrics(indexNodeForest(nodes)!)).toBeNull();
  });
});
