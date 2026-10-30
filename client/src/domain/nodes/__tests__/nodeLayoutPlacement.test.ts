import { indexNodeForest, type IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import {
  calculateNodeLayoutMetrics,
  type NodeLayoutMetrics,
} from "@/domain/nodes/nodeLayoutMetrics";
import { placeNodeForest } from "@/domain/nodes/nodeLayoutPlacement";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null, y = 0, height = 60): Node {
  return createTestNode({ id, parentId, x: 80, y, height, label: String(id) });
}

// 実際の寸法計算の結果で配置する。寸法計算では止まらず、配置の計算まで届く入力だけを使う
function placeWithCalculatedMetrics(nodes: readonly Node[]): ReturnType<typeof placeNodeForest> {
  const forest = indexNodeForest(nodes)!;
  const metrics = calculateNodeLayoutMetrics(forest);
  expect(metrics).not.toBeNull();
  return placeNodeForest(forest, metrics!);
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

// 2 ** 60 の前後の浮動小数点数の間隔は、下が 128、上が 256 なので、半分未満の加減算は失われる
describe("placeNodeForest: 中央揃えと積み上げの桁落ち", () => {
  it("ルートのspanから自身の高さを引けなければnull", () => {
    // ルートは高さ60のまま、子の高さで span が 2 ** 60 になり、2 ** 60 - 60 が 2 ** 60 へ丸められる
    const nodes = [node(1, null, 0, 60), node(2, 1, 0, 2 ** 60)];

    expect(placeWithCalculatedMetrics(nodes)).toBeNull();
  });

  it("ルート以外のノードのspanから自身の高さを引けなければnull", () => {
    // ルートの span は自身の高さと同じで余りが 0 になり、中間のノード 2 だけが丸めで失敗する
    const nodes = [node(1, null, 0, 2 ** 60), node(2, 1, 0, 60), node(3, 2, 0, 2 ** 60)];

    expect(placeWithCalculatedMetrics(nodes)).toBeNull();
  });

  it("spanから子グループの高さを引けなければnull", () => {
    // 自身の高さが span と同じなので y は求まり、子グループの高さ60を引くところで丸められる
    const nodes = [node(1, null, 0, 2 ** 60), node(2, 1, 0, 60)];

    expect(placeWithCalculatedMetrics(nodes)).toBeNull();
  });

  it("子グループの先頭の位置が桁落ちすればnull", () => {
    // 親の y は余り 0 で求まり、子グループを中央へ寄せる 100 の加算だけが失われる
    const nodes = [node(1, null, 2 ** 60, 300), node(2, 1, 0, 100)];

    expect(placeWithCalculatedMetrics(nodes)).toBeNull();
  });

  it("次の兄弟の位置を求めるとき、前の兄弟のspanの加算が桁落ちすればnull", () => {
    // 親の高さは子グループの高さ（1 + 40 + 1）と同じで余りが 0 になり、高さ1の加算が失われる
    const nodes = [node(1, null, 2 ** 60, 42), node(2, 1, 0, 1), node(3, 1, 0, 1)];

    expect(placeWithCalculatedMetrics(nodes)).toBeNull();
  });

  it("次の兄弟の位置を求めるとき、兄弟の間隔の加算が桁落ちすればnull", () => {
    // 高さ256の加算は保たれ、間隔40の加算だけが失われる
    const nodes = [node(1, null, 2 ** 60, 552), node(2, 1, 0, 256), node(3, 1, 0, 256)];

    expect(placeWithCalculatedMetrics(nodes)).toBeNull();
  });
});
