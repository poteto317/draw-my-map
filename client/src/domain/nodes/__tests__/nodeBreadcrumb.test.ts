import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { buildNodeBreadcrumb } from "@/domain/nodes/nodeBreadcrumb";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, label: "根" }),
  createTestNode({ id: 2, parentId: 1, label: "子" }),
  createTestNode({ id: 3, parentId: 2, label: "孫" }),
];

it("選択ノードから根までのパンくずを根側から返す", () => {
  const index = createNodeCollapseIndex(nodes)!;
  expect(buildNodeBreadcrumb(index, 3).map(({ id }) => id)).toEqual([1, 2, 3]);
  expect(buildNodeBreadcrumb(index, 1).map(({ id }) => id)).toEqual([1]);
  expect(buildNodeBreadcrumb(index, null)).toEqual([]);
  expect(buildNodeBreadcrumb(null, 3)).toEqual([]);
  expect(buildNodeBreadcrumb(index, 999)).toEqual([]);
});
