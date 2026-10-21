import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { useBranchCollapse } from "@/hooks/useBranchCollapse";
import { useState } from "react";
import type { ResolutionFilterMode } from "@/types/nodeResolution";
import { act, renderHook } from "@testing-library/react";
import { useNodeSearchNavigation } from "@/hooks/useNodeSearchNavigation";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function renderNavigation({
  nodes,
  resolutionVisibleNodeIds = new Set<number>(),
  documentRevision = 0,
}: {
  nodes: readonly Node[];
  resolutionVisibleNodeIds?: ReadonlySet<number>;
  documentRevision?: number;
}) {
  const setResolutionMode = jest.fn();
  const selectNode = jest.fn();
  const hook = renderHook(
    (props: { nodes: readonly Node[]; resolutionVisibleNodeIds: ReadonlySet<number>; documentRevision: number }) =>
      useNodeSearchNavigation({ ...props, collapseIndex: createNodeCollapseIndex(props.nodes), collapsedNodeIds: new Set(), expandNodes: jest.fn(), setResolutionMode, selectNode }),
    { initialProps: { nodes, resolutionVisibleNodeIds, documentRevision } },
  );
  return { ...hook, setResolutionMode, selectNode };
}

describe("useNodeSearchNavigation", () => {
  it("見えているノードを選択し、同じIDでも毎回新しい移動要求を出す", () => {
    const node = createTestNode({ id: 7, importance: "high" });
    const { result, selectNode, setResolutionMode } = renderNavigation({
      nodes: [node],
      resolutionVisibleNodeIds: new Set([7]),
      documentRevision: 3,
    });

    let firstResult: string | undefined;
    act(() => { firstResult = result.current.navigateToNode(7); });
    expect(firstResult).toBe("navigated");
    expect(selectNode).toHaveBeenLastCalledWith(7);
    expect(setResolutionMode).not.toHaveBeenCalled();
    expect(result.current.focusRequest).toEqual({ nodeId: 7, sequence: 1, documentRevision: 3 });
    expect(result.current.notice).toBeNull();

    act(() => result.current.navigateToNode(7));
    expect(result.current.focusRequest).toEqual({ nodeId: 7, sequence: 2, documentRevision: 3 });
  });

  it.each([
    ["medium", "medium", "中以上"],
    ["low", "all", "すべて"],
  ] as const)("隠れた%s重要度のノードを表示して選択する", (importance, mode, label) => {
    const node = createTestNode({ id: 8, importance });
    const { result, selectNode, setResolutionMode } = renderNavigation({ nodes: [node] });

    let navigationResult: string | undefined;
    act(() => { navigationResult = result.current.navigateToNode(8); });

    expect(navigationResult).toBe("revealed");
    expect(setResolutionMode).toHaveBeenCalledWith(mode);
    expect(selectNode).toHaveBeenCalledWith(8);
    expect(result.current.focusRequest).toEqual({ nodeId: 8, sequence: 1, documentRevision: 0 });
    expect(result.current.notice).toEqual({
      kind: "status",
      message: `表示を『${label}』に切り替えました。ズームに連動させるには『自動』を選んでください。`,
    });
  });

  it("存在しないIDでは状態を変えずエラーを通知する", () => {
    const node = createTestNode({ id: 1 });
    const { result, selectNode, setResolutionMode } = renderNavigation({
      nodes: [node],
      resolutionVisibleNodeIds: new Set([1]),
    });
    act(() => result.current.navigateToNode(1));
    const focusRequest = result.current.focusRequest;
    selectNode.mockClear();
    setResolutionMode.mockClear();

    let navigationResult: string | undefined;
    act(() => { navigationResult = result.current.navigateToNode(99); });

    expect(navigationResult).toBe("missing");
    expect(selectNode).not.toHaveBeenCalled();
    expect(setResolutionMode).not.toHaveBeenCalled();
    expect(result.current.focusRequest).toEqual(focusRequest);
    expect(result.current.notice).toEqual({ kind: "error", message: "ノードが見つかりませんでした。" });
  });

  it("文書の世代が変わると古い通知と移動要求を隠し、次の要求は連番を保つ", () => {
    const firstNode = createTestNode({ id: 4, importance: "low" });
    const { result, rerender } = renderNavigation({ nodes: [firstNode], documentRevision: 1 });
    act(() => result.current.navigateToNode(4));
    expect(result.current.notice).not.toBeNull();

    const replacementNode = createTestNode({ id: 4, label: "replacement", importance: "high" });
    rerender({ nodes: [replacementNode], resolutionVisibleNodeIds: new Set([4]), documentRevision: 2 });

    expect(result.current.notice).toBeNull();
    expect(result.current.focusRequest).toBeNull();
    act(() => result.current.navigateToNode(4));
    expect(result.current.focusRequest).toEqual({ nodeId: 4, sequence: 2, documentRevision: 2 });
  });
});

const tree = [
  createTestNode({ id: 1 }), createTestNode({ id: 2, parentId: 1 }),
  createTestNode({ id: 3, parentId: 2, importance: "low" }), createTestNode({ id: 4, parentId: 3 }),
  createTestNode({ id: 5 }), createTestNode({ id: 6, parentId: 5 }),
];
function useIntegratedNavigation(nodes: readonly Node[], inResolution: boolean) {
  const collapse = useBranchCollapse({ nodes, documentRevision: 1 });
  const [mode, setMode] = useState<ResolutionFilterMode>("auto");
  const [selected, selectNode] = useState<number | null>(null);
  const navigation = useNodeSearchNavigation({
    nodes, resolutionVisibleNodeIds: new Set(inResolution ? [1, 2, 3, 4, 5, 6] : [1, 2, 5, 6]), documentRevision: 1,
    collapseIndex: collapse.index, collapsedNodeIds: collapse.collapsedNodeIds,
    expandNodes: collapse.expandNodes, setResolutionMode: setMode, selectNode,
  });
  return { collapse, mode, selected, ...navigation };
}
describe("祖先展開の検索連携", () => {
  it.each([true, false])("祖先だけ展開し、Rに対象を含む=%sに応じて段階と通知を変える", (inResolution) => {
    const { result } = renderHook(() => useIntegratedNavigation(tree, inResolution));
    act(() => [1, 2, 3, 5].forEach(result.current.collapse.toggle));
    let outcome: string | undefined;
    act(() => { outcome = result.current.navigateToNode(3); });
    expect(outcome).toBe("revealed");
    expect([...result.current.collapse.collapsedNodeIds]).toEqual([3, 5]);
    expect(result.current.collapse.collapseVisibleNodeIds.has(3)).toBe(true);
    expect(result.current.mode).toBe(inResolution ? "auto" : "all");
    expect(result.current.selected).toBe(3);
    expect(result.current.focusRequest).toEqual({ nodeId: 3, sequence: 1, documentRevision: 1 });
    expect(result.current.notice?.message).toBe("検索結果を表示するため、祖先の枝を展開しました。" + (inResolution ? "" : " 表示を『すべて』に切り替えました。ズームに連動させるには『自動』を選んでください。"));
  });
  it("検索後に消えた対象では祖先も表示段階も選択も要求も変更しない", () => {
    const { result, rerender } = renderHook(({ nodes }) => useIntegratedNavigation(nodes, false), { initialProps: { nodes: tree } });
    act(() => result.current.collapse.toggle(1));
    rerender({ nodes: tree.filter(node => node.id !== 3 && node.id !== 4) });
    let outcome: string | undefined;
    act(() => { outcome = result.current.navigateToNode(3); });
    expect(outcome).toBe("missing");
    expect([...result.current.collapse.collapsedNodeIds]).toEqual([1]);
    expect(result.current.mode).toBe("auto");
    expect(result.current.selected).toBeNull();
    expect(result.current.focusRequest).toBeNull();
  });
});
