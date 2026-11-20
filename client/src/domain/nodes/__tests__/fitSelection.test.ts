import { filterSelectedFitNodes } from "@/domain/nodes/fitSelection";
import { createTestNode } from "@/testing/createTestNode";

it("表示中かつ選択中のノードだけを合わせ対象にする", () => {
  const fitNodes = [
    createTestNode({ id: 1 }),
    createTestNode({ id: 2 }),
    createTestNode({ id: 3 }),
  ];
  expect(
    filterSelectedFitNodes(fitNodes, new Set([1, 3]), [1, 2]).map(({ id }) => id),
  ).toEqual([1]);
});
