import { act, renderHook } from "@testing-library/react";
import { useBranchCollapse } from "@/hooks/useBranchCollapse";
import { useBranchFocus } from "@/hooks/useBranchFocus";
import { createTestNode } from "@/testing/createTestNode";

it("集中先の復元時に残った祖先だけを展開する", () => {
  const nodes = [
    createTestNode({ id: 1 }),
    createTestNode({ id: 2, parentId: 1 }),
    createTestNode({ id: 3, parentId: 2 }),
    createTestNode({ id: 4, parentId: 3 }),
    createTestNode({ id: 5 }),
    createTestNode({ id: 6, parentId: 5 }),
  ];
  const { result } = renderHook(() => {
    const branch = useBranchCollapse({ nodes, documentRevision: 0 });
    const focus = useBranchFocus({
      mapId: "test-map",
      resetRevision: 0,
      collapseIndex: branch.index,
      expandNodes: branch.expandNodes,
    });
    return { branch, focus };
  });

  act(() => {
    result.current.branch.setCollapsedNodeIds(new Set([1, 2, 3, 4, 5, 99]));
    result.current.focus.setFocusRootId(3);
  });

  expect(result.current.focus.focusRootId).toBe(3);
  expect(result.current.focus.focusVisibleNodeIds).toEqual(new Set([3, 4]));
  expect(result.current.branch.collapsedNodeIds).toEqual(new Set([3, 5]));
  expect(result.current.branch.collapseVisibleNodeIds).toEqual(new Set([1, 2, 3, 5]));
});
