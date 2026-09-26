import { indexNodeForest, type IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { NodeLayoutMetrics } from "@/domain/nodes/nodeLayoutMetrics";
import { placeNodeForest } from "@/domain/nodes/nodeLayoutPlacement";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null, y = 0, height = 60): Node {
  return createTestNode({ id, parentId, x: 80, y, height, label: String(id) });
}

describe("placeNodeForest", () => {
  it("逐次丸めでspanを超えた子の実下端から次のツリーを離す", () => {
    const children = Array.from({ length: 8 }, (_, index) => node(index + 2, 1, 0, 9));
    const forest = indexNodeForest([node(1, null, 2 ** 56, 352), ...children, node(10, null)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80, 300],
      spanById: new Map([[1, 352], ...children.map((child): [number, number] => [child.id, 9]), [10, 60]]),
      childrenHeightById: new Map([[1, 352], ...children.map((child): [number, number] => [child.id, 0]), [10, 0]]),
    };

    const positions = placeNodeForest(forest, metrics);

    expect(positions).not.toBeNull();
    expect(positions!.get(9)!.y - 2 ** 56).toBe(448);
    expect(positions!.get(10)!.y - (positions!.get(9)!.y + 9)).toBe(80);
  });

  it("後続ルートがある場合は子の実下端のprecision saturationを拒否する", () => {
    const forest = indexNodeForest([node(1, null, 2 ** 56, 128), node(2, 1, 0, 1), node(3, null)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80, 300],
      spanById: new Map([[1, 128], [2, 1], [3, 60]]),
      childrenHeightById: new Map([[1, 1], [2, 0], [3, 0]]),
    };

    expect(placeNodeForest(forest, metrics)).toBeNull();
  });

  it("大座標でツリー間の実gapが64へ丸められる配置を拒否する", () => {
    const forest = indexNodeForest([node(1, null, 2 ** 57, 64), node(2, null)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80],
      spanById: new Map([[1, 64], [2, 60]]),
      childrenHeightById: new Map([[1, 0], [2, 0]]),
    };

    expect(placeNodeForest(forest, metrics)).toBeNull();
  });

  it("10,000階層の全ノードを配置し、末端まで座標を返す", () => {
    const nodes = Array.from({ length: 10_000 }, (_, depth) =>
      node(depth + 1, depth === 0 ? null : depth, 25));
    const forest: IndexedNodeForest = {
      nodes,
      roots: [nodes[0]],
      childrenByParent: new Map(nodes.slice(1).map((child) => [child.parentId!, [child]])),
      depthById: new Map(nodes.map((current, depth) => [current.id, depth])),
      nodesByDepth: nodes.map((current) => [current]),
      postOrder: [...nodes].reverse(),
    };
    const metrics: NodeLayoutMetrics = {
      columnX: nodes.map((_, depth) => 80 + depth * 220),
      spanById: new Map(nodes.map((current) => [current.id, 60])),
      childrenHeightById: new Map(nodes.map((current) =>
        [current.id, current.id === 10_000 ? 0 : 60])),
    };

    const positions = placeNodeForest(forest, metrics);

    expect(positions?.size).toBe(10_000);
    expect(positions?.get(1)).toEqual({ x: 80, y: 25 });
    expect(positions?.get(5_001)).toEqual({ x: 1_100_080, y: 25 });
    expect(positions?.get(10_000)).toEqual({ x: 2_199_860, y: 25 });
  });

  it("最初のルートの小数Yを正確に保持し、入力順の子を中央配置する", () => {
    const forest = indexNodeForest([node(1, null, 0.1), node(3, 1), node(2, 1)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80, 300],
      spanById: new Map([[1, 160], [3, 60], [2, 60]]),
      childrenHeightById: new Map([[1, 160], [3, 0], [2, 0]]),
    };
    const positions = placeNodeForest(forest, metrics);

    expect(positions?.get(1)).toEqual({ x: 80, y: 0.1 });
    expect(positions?.get(3)).toEqual({ x: 300, y: -49.9 });
    expect(positions?.get(2)).toEqual({ x: 300, y: 50.1 });
  });

  it("親自身が子グループより高いとき親span内で子グループを中央配置する", () => {
    const forest = indexNodeForest([node(1, null, 50, 300), node(2, 1), node(3, 1)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80, 300],
      spanById: new Map([[1, 300], [2, 60], [3, 60]]),
      childrenHeightById: new Map([[1, 160], [2, 0], [3, 0]]),
    };
    const positions = placeNodeForest(forest, metrics);

    expect(positions?.get(1)).toEqual({ x: 80, y: 50 });
    expect(positions?.get(2)).toEqual({ x: 300, y: 120 });
    expect(positions?.get(3)).toEqual({ x: 300, y: 220 });
  });

  it("後続ルートを前の部分木spanとtree gapの後へ置く", () => {
    const forest = indexNodeForest([node(1, null, 50), node(2, 1), node(3, 1), node(9, null)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80, 300],
      spanById: new Map([[1, 160], [2, 60], [3, 60], [9, 60]]),
      childrenHeightById: new Map([[1, 160], [2, 0], [3, 0], [9, 0]]),
    };

    expect(placeNodeForest(forest, metrics)?.get(9)).toEqual({ x: 80, y: 240 });
  });

  it.each([false, true])("葉のchildTop・最後の子とルートの末尾を計算しない（子あり: %s）", (withChild) => {
    const nodes = [node(1, null, Number.MAX_VALUE)];
    if (withChild) nodes.push(node(2, 1));
    const metrics: NodeLayoutMetrics = {
      columnX: [80, 300],
      spanById: new Map([[1, 60], [2, 60]]),
      childrenHeightById: new Map([[1, withChild ? 60 : 0], [2, 0]]),
    };
    const positions = placeNodeForest(indexNodeForest(nodes)!, metrics);

    expect(positions?.get(1)).toEqual({ x: 80, y: Number.MAX_VALUE });
    if (withChild) expect(positions?.get(2)).toEqual({ x: 300, y: Number.MAX_VALUE });
  });

  it("最初のルートを固定する場合も中間Y計算のprecision saturationを拒否する", () => {
    const forest = indexNodeForest([node(1, null, -(2 ** 59) - 128, 128), node(2, 1, 0, 256)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80, 300],
      spanById: new Map([[1, 256], [2, 256]]),
      childrenHeightById: new Map([[1, 256], [2, 0]]),
    };

    expect(placeNodeForest(forest, metrics)).toBeNull();
  });

  it("後続ルートがある場合は必要なtree gapのprecision saturationを拒否する", () => {
    const forest = indexNodeForest([node(1, null, 2 ** 60, 256), node(2, null)])!;
    const metrics: NodeLayoutMetrics = {
      columnX: [80],
      spanById: new Map([[1, 256], [2, 60]]),
      childrenHeightById: new Map([[1, 0], [2, 0]]),
    };

    expect(placeNodeForest(forest, metrics)).toBeNull();
  });
});
