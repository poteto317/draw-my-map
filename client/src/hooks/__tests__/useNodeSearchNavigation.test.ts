import { act, renderHook } from "@testing-library/react";
import { useNodeSearchNavigation } from "@/hooks/useNodeSearchNavigation";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function renderNavigation({
  nodes,
  visibleNodeIds = new Set<number>(),
  documentRevision = 0,
}: {
  nodes: readonly Node[];
  visibleNodeIds?: ReadonlySet<number>;
  documentRevision?: number;
}) {
  const setResolutionMode = jest.fn();
  const selectNode = jest.fn();
  const hook = renderHook(
    (props: { nodes: readonly Node[]; visibleNodeIds: ReadonlySet<number>; documentRevision: number }) =>
      useNodeSearchNavigation({ ...props, setResolutionMode, selectNode }),
    { initialProps: { nodes, visibleNodeIds, documentRevision } },
  );
  return { ...hook, setResolutionMode, selectNode };
}

describe("useNodeSearchNavigation", () => {
  it("見えているノードを選択し、同じIDでも毎回新しい移動要求を出す", () => {
    const node = createTestNode({ id: 7, importance: "high" });
    const { result, selectNode, setResolutionMode } = renderNavigation({
      nodes: [node],
      visibleNodeIds: new Set([7]),
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
      visibleNodeIds: new Set([1]),
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
    rerender({ nodes: [replacementNode], visibleNodeIds: new Set([4]), documentRevision: 2 });

    expect(result.current.notice).toBeNull();
    expect(result.current.focusRequest).toBeNull();
    act(() => result.current.navigateToNode(4));
    expect(result.current.focusRequest).toEqual({ nodeId: 4, sequence: 2, documentRevision: 2 });
  });
});
