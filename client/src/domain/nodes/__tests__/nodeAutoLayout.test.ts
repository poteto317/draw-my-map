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
