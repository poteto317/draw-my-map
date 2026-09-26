import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
  TREE_VERTICAL_GAP,
} from "@/config/shapes";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(
  id: number,
  parentId: number | null,
  x = 0,
  y = 0,
  width = 100,
  height = 60,
): Node {
  return createTestNode({ id, parentId, x, y, width, height, label: `node-${id}` });
}

function overlaps(a: Node, b: Node): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

it("単一葉の未使用bottomとchildTopを計算せず大座標を維持する", () => {
  const root = node(1, null, 0, Number.MAX_VALUE);
  const result = layoutNodeForest([root]);
  expect(result).toEqual([root]);
  expect(result?.[0]).toBe(root);
});

it("最後の子の後へ未使用gapを加算しない", () => {
  const root = node(1, null, 0, Number.MAX_VALUE);
  const child = node(2, 1);
  const result = layoutNodeForest([root, child]);
  expect(result).not.toBeNull();
  expect(result?.[0].y).toBe(Number.MAX_VALUE);
  expect(result?.[1].y).toBe(Number.MAX_VALUE);
});

it("最初のルートを固定し、深さごとの最大幅でX列を揃える", () => {
  const result = layoutNodeForest([
    node(1, null, 80, 120, 140),
    node(2, 1, 900, 900, 80),
    node(3, 2, -10, -10, 100),
    node(4, 1, 500, 500, 200),
  ])!;

  expect(result.find(({ id }) => id === 1)).toMatchObject({ x: 80, y: 120 });
  expect(result.find(({ id }) => id === 2)?.x).toBe(80 + 140 + CHILD_HORIZONTAL_GAP);
  expect(result.find(({ id }) => id === 4)?.x).toBe(80 + 140 + CHILD_HORIZONTAL_GAP);
  expect(result.find(({ id }) => id === 3)?.x)
    .toBe(80 + 140 + CHILD_HORIZONTAL_GAP + 200 + CHILD_HORIZONTAL_GAP);
});

it("親を子グループ中央へ置き、入力順の兄弟を縦方向へ離す", () => {
  const result = layoutNodeForest([
    node(1, null, 50, 70),
    node(2, 1),
    node(3, 1),
  ])!;
  const [root, first, second] = result;

  expect(root.y).toBe(70);
  expect(second.y).toBe(first.y + first.height + SIBLING_VERTICAL_GAP);
  expect(root.y + root.height / 2)
    .toBe((first.y + (second.y + second.height)) / 2);
});

it("複数ルートを入力順に積み、部分木区間の間へtree gapを置く", () => {
  const result = layoutNodeForest([
    node(1, null, 30, 40), node(2, 1), node(9, null),
  ])!;
  const firstTreeBottom = Math.max(
    ...result.filter(({ id }) => id !== 9).map((current) => current.y + current.height),
  );
  const secondRoot = result.find(({ id }) => id === 9)!;

  expect(secondRoot.x).toBe(30);
  expect(secondRoot.y).toBe(firstTreeBottom + TREE_VERTICAL_GAP);
});

it("有効入力では新配列を返し、未移動参照と座標以外を維持する", () => {
  const root = node(1, null, 80, 120);
  const child = node(2, 1, 0, 0);
  const input = [root, child];
  const snapshot = input.map((current) => ({ ...current }));
  const result = layoutNodeForest(input)!;

  expect(result).not.toBe(input);
  expect(result[0]).toBe(root);
  expect(result[1]).not.toBe(child);
  expect(result.map(({ id, parentId, width, height, label }) => (
    { id, parentId, width, height, label }
  ))).toEqual(snapshot.map(({ id, parentId, width, height, label }) => (
    { id, parentId, width, height, label }
  )));
  expect(input).toEqual(snapshot);
});

it("非整数Yの最初のルートを再計算せず同じ参照で固定する", () => {
  const root = node(1, null, 80, 0.1);
  const result = layoutNodeForest([root, node(2, 1), node(3, 1)])!;

  expect(result[0]).toBe(root);
  expect(result[0].y).toBe(0.1);
});

it("配置済みの全ノードは再配置でも同じ参照を保ち、新配列だけを返す", () => {
  const laidOut = layoutNodeForest([node(1, null, 80, 120), node(2, 1), node(3, 2), node(4, 1)])!;

  const result = layoutNodeForest(laidOut)!;

  expect(result).not.toBe(laidOut);
  expect(result).toHaveLength(laidOut.length);
  result.forEach((current, index) => expect(current).toBe(laidOut[index]));
});

it("異なる寸法・深さ・複数ルートの全組み合わせが重ならない", () => {
  const result = layoutNodeForest([
    node(1, null, 20, 50, 130, 90), node(2, 1, 0, 0, 70, 40),
    node(3, 1, 0, 0, 200, 120), node(4, 2, 0, 0, 50, 180),
    node(9, null, 0, 0, 160, 75), node(10, 9, 0, 0, 90, 60),
  ])!;
  for (let left = 0; left < result.length; left += 1) {
    for (let right = left + 1; right < result.length; right += 1) {
      expect(overlaps(result[left], result[right])).toBe(false);
    }
  }
});

it("小数寸法の境界丸めで有効な配置を拒否せず、全ノードが重ならない", () => {
  const root = node(1, null, 0, 164.3);
  const result = layoutNodeForest([
    root,
    node(2, 1, 0, 0, 100, 48.6),
    node(3, 1),
    node(4, 2, 0, 0, 100, 118.8),
    node(6, 3, 0, 0, 100, 116.4),
    node(9, 4, 0, 0, 100, 56.7),
    node(10, 4, 0, 0, 100, 187.7),
    node(12, 6, 0, 0, 100, 135.2),
  ]);

  expect(result).not.toBeNull();
  expect(result).toHaveLength(8);
  expect(result![0]).toBe(root);
  const previous = result!.find(({ id }) => id === 10)!;
  const next = result!.find(({ id }) => id === 12)!;
  expect(next.y - (previous.y + previous.height)).toBeCloseTo(40, 10);
  for (let left = 0; left < result!.length; left += 1) {
    for (let right = left + 1; right < result!.length; right += 1) {
      expect(overlaps(result![left], result![right])).toBe(false);
    }
  }
});

it("大座標で兄弟の実gapが32へ丸められる配置を拒否する", () => {
  const result = layoutNodeForest([
    node(1, null, 0, 2 ** 57),
    node(2, 1),
    node(3, 1),
  ]);

  expect(result).toBeNull();
});

it("大座標で親子列の実gapが112へ丸められる配置を拒否する", () => {
  expect(layoutNodeForest([node(1, null, 2 ** 56, 0, 112), node(2, 1)])).toBeNull();
});

it("大座標でツリー間の実gapが64へ丸められる配置を拒否する", () => {
  expect(layoutNodeForest([node(1, null, 0, 2 ** 57, 100, 64), node(2, null)])).toBeNull();
});

it("逐次丸めで部分木spanを超えても全ノードの実下端からtree gapを確保する", () => {
  const result = layoutNodeForest([
    node(1, null, 0, 2 ** 56, 100, 352),
    ...Array.from({ length: 8 }, (_, index) => node(index + 2, 1, 0, 0, 100, 9)),
    node(10, null),
  ]);

  expect(result).not.toBeNull();
  const actualBottom = Math.max(...result!.slice(0, 9).map((current) => current.y + current.height));
  expect(actualBottom - 2 ** 56).toBe(464);
  expect(result![9].y - actualBottom).toBe(80);
});

it("後続ツリーに必要な子の実下端がprecision saturationすると拒否する", () => {
  expect(layoutNodeForest([
    node(1, null, 0, 2 ** 56, 100, 128),
    node(2, 1, 0, 0, 100, 1),
    node(3, null),
  ])).toBeNull();
});

it("子が親より先でも出力入力順と降順IDのルート配置順を維持する", () => {
  const firstRoot = node(90, null, 80, 100);
  const result = layoutNodeForest([
    node(12, 10), node(92, 90), firstRoot,
    node(52, 50), node(50, null, 900, 900), node(10, null, -100, -100),
  ]);

  expect(result?.map(({ id }) => id)).toEqual([12, 92, 90, 52, 50, 10]);
  expect(result?.[2]).toBe(firstRoot);
  expect(result?.[2]).toMatchObject({ x: 80, y: 100 });
  expect(result?.filter(({ parentId }) => parentId === null).map(({ id, x, y }) => ({ id, x, y })))
    .toEqual([{ id: 90, x: 80, y: 100 }, { id: 50, x: 80, y: 240 }, { id: 10, x: 80, y: 380 }]);
});

it.each<[string, Node[], Node[] | null]>([
  ["空配列", [], []],
  ["ID重複", [node(1, null), node(1, null)], null],
  ["親欠損", [node(1, 99)], null],
  ["循環", [node(1, 2), node(2, 1)], null],
  [
    "列位置overflow",
    [node(1, null, Number.MAX_VALUE, 0, Number.MAX_VALUE), node(2, 1)],
    null,
  ],
  [
    "部分木span overflow",
    [node(1, null), node(2, 1, 0, 0, 1, Number.MAX_VALUE),
      node(3, 1, 0, 0, 1, Number.MAX_VALUE)],
    null,
  ],
  [
    "列位置precision saturation",
    [node(1, null, Number.MAX_VALUE, 0, 1), node(2, 1)],
    null,
  ],
  [
    "部分木span precision saturation",
    [node(1, null), node(2, 1, 0, 0, 1, Number.MAX_VALUE), node(3, 1)],
    null,
  ],
  [
    "部分木top precision saturation",
    [node(1, null, 0, -Number.MAX_VALUE), node(2, 1), node(3, 1)],
    null,
  ],
])("%sの公開結果を返す", (_name, input, expected) => {
  expect(layoutNodeForest(input)).toEqual(expected);
});
