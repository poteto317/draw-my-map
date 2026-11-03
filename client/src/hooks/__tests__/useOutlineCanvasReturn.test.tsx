import { act, renderHook } from "@testing-library/react";
import { useRevisionScopedNodeRequest } from "@/hooks/useRevisionScopedNodeRequest";
import { useNodeSearchNavigation } from "@/hooks/useNodeSearchNavigation";
import { useNodeFocusRequest } from "@/components/map/useNodeFocusRequest";
import { useOutlineCanvasReturn } from "@/hooks/useOutlineCanvasReturn";
import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2, parentId: 1, importance: "low" })];
function setup(selectedNodeId: number | null = 2, resolutionMode: "auto" | "high" = "auto") {
  const expandNodes = jest.fn(), setResolutionMode = jest.fn(), publishNotice = jest.fn(), issueFocusRequest = jest.fn();
  const hook = renderHook(() => useOutlineCanvasReturn({ nodes, selectedNodeId, documentRevision: 4,
    collapseIndex: createNodeCollapseIndex(nodes), collapsedNodeIds: new Set([1]), resolutionMode,
    expandNodes, setResolutionMode, publishNotice, issueFocusRequest }));
  return { ...hook, expandNodes, setResolutionMode, publishNotice, issueFocusRequest };
}
it("初期倍率のauto集合で祖先だけ展開し、検索ではない通知と選択focus要求を発行する", () => {
  const h = setup(); act(() => h.result.current.returnToCanvas());
  expect(h.expandNodes).toHaveBeenCalledWith([1]);
  expect(h.setResolutionMode).not.toHaveBeenCalled();
  expect(h.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "選択したノードを表示するため、祖先の枝を展開しました。" });
  expect(h.issueFocusRequest).toHaveBeenCalledWith(2);
});
it("手動highで隠れた選択は必要なallへ切替える", () => {
  const h = setup(2, "high"); act(() => h.result.current.returnToCanvas());
  expect(h.setResolutionMode).toHaveBeenCalledWith("all");
  expect(h.publishNotice.mock.lastCall?.[0].message).toContain("すべて");
  expect(h.publishNotice.mock.lastCall?.[0].message).not.toContain("検索");
});
it.each([null, 99])("選択%sはfocus要求を発行しない", id => {
  const h = setup(id); act(() => h.result.current.returnToCanvas());
  expect(h.expandNodes).not.toHaveBeenCalled(); expect(h.setResolutionMode).not.toHaveBeenCalled();
  expect(h.issueFocusRequest).not.toHaveBeenCalled();
});

// 検索と復帰は同じissuerを使い、実focus consumerのsequence重複排除を通す。
it("共通issuerの復帰→検索と検索→復帰→検索を実consumerが毎回1度だけ処理する", () => {
  const onFocusNode = jest.fn();
  const { result, rerender } = renderHook(() => {
    const issuer = useRevisionScopedNodeRequest(5);
    const common = { nodes, documentRevision: 5, collapseIndex: createNodeCollapseIndex(nodes),
      collapsedNodeIds: new Set<number>(), expandNodes: jest.fn(), setResolutionMode: jest.fn(), issueFocusRequest: issuer.issueRequest };
    const returning = useOutlineCanvasReturn({ ...common, selectedNodeId: 2, resolutionMode: "auto", publishNotice: jest.fn() });
    const search = useNodeSearchNavigation({ ...common, resolutionVisibleNodeIds: new Set([1, 2]), selectNode: jest.fn() });
    useNodeFocusRequest({ request: issuer.request, documentRevision: 5, nodes, screen: { width: 800, height: 600 },
      hasActiveGesture: () => false, cancelActiveGesture: jest.fn(), onFocusNode });
    return { issuer, returning, search };
  });
  act(() => result.current.returning.returnToCanvas());
  expect(result.current.issuer.request?.sequence).toBe(1);
  act(() => result.current.search.navigateToNode(1));
  expect(result.current.issuer.request?.sequence).toBe(2);
  rerender();
  expect(onFocusNode.mock.calls.map(([node]) => node.id)).toEqual([2, 1]);
  act(() => { result.current.issuer.clearRequest(); result.current.returning.returnToCanvas(); });
  expect(result.current.issuer.request?.sequence).toBe(3);
  act(() => result.current.search.navigateToNode(1));
  expect(result.current.issuer.request?.sequence).toBe(4);
  rerender();
  expect(onFocusNode.mock.calls.map(([node]) => node.id)).toEqual([2, 1, 2, 1]);
});
