import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
  TREE_VERTICAL_GAP,
} from "@/config/shapes";
import type { Node } from "@/types/node";

function node(
  id: number,
  parentId: number | null,
  x = 0,
  y = 0,
  width = 100,
  height = 60,
): Node {
  return { id, parentId, x, y, width, height, label: `node-${id}` };
}

function overlaps(a: Node, b: Node): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

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
