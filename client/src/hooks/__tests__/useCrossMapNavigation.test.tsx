import { act, renderHook } from "@testing-library/react";
import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { useCrossMapNavigation } from "@/hooks/useCrossMapNavigation";
import { createTestNode } from "@/testing/createTestNode";

describe("useCrossMapNavigation", () => {
  it("アウトライン表示中で reveal が失敗する場合、状態変更を一切行わずに不在通知だけを出す", () => {
    const nodes = [createTestNode({ id: 1, parentId: null, label: "ルート" })];
    // 意図的に空の collapseIndex を渡して resolveNodeSearchReveal が null を返す異常系を再現
    const emptyCollapseIndex = createNodeCollapseIndex([]);
    const clearCanvasFocusRequest = jest.fn();
    const setViewportScale = jest.fn();
    const resetViewportScale = jest.fn();
    const setViewMode = jest.fn();
    const selectNode = jest.fn();
    const issueCanvasFocusRequest = jest.fn();

    const { result } = renderHook(() =>
      useCrossMapNavigation({
        mapId: "map-1",
        sessionNumber: 1,
        hydrated: true,
        nodes,
        documentRevision: 1,
        viewMode: "outline",
        initialViewportScale: 1,
        resolutionMode: "all",
        collapseIndex: emptyCollapseIndex,
        collapsedNodeIds: new Set(),
        expandNodes: jest.fn(),
        setResolutionMode: jest.fn(),
        resetViewportScale,
        setViewportScale,
        setViewMode,
        selectNode,
        issueCanvasFocusRequest,
        clearCanvasFocusRequest,
        navigateToNodeInMapView: jest.fn(),
        pendingNavigation: null,
        onConsumePendingNavigation: jest.fn(),
        onSwitchToMapTarget: jest.fn(),
      }),
    );

    act(() => {
      result.current.navigateToMapTarget("map-1", 1);
    });

    expect(clearCanvasFocusRequest).not.toHaveBeenCalled();
    expect(setViewportScale).not.toHaveBeenCalled();
    expect(resetViewportScale).not.toHaveBeenCalled();
    expect(setViewMode).not.toHaveBeenCalled();
    expect(selectNode).not.toHaveBeenCalled();
    expect(issueCanvasFocusRequest).not.toHaveBeenCalled();
    expect(result.current.navigationNotice).toEqual({
      kind: "error",
      message: "移動先のノードが見つかりませんでした",
    });
  });

  it("pendingNavigation は対象マップ・セッション・hydrated 一致時に 1 回だけ消費する", () => {
    const nodes = [createTestNode({ id: 10, parentId: null, label: "対象" })];
    const navigateToNodeInMapView = jest.fn();
    const onConsumePendingNavigation = jest.fn();

    const { rerender } = renderHook(
      ({ hydrated }: { hydrated: boolean }) =>
        useCrossMapNavigation({
          mapId: "map-2",
          sessionNumber: 3,
          hydrated,
          nodes,
          documentRevision: 1,
          viewMode: "map",
          initialViewportScale: 1,
          resolutionMode: "all",
          collapseIndex: createNodeCollapseIndex(nodes),
          collapsedNodeIds: new Set(),
          expandNodes: jest.fn(),
          setResolutionMode: jest.fn(),
          resetViewportScale: jest.fn(),
          setViewportScale: jest.fn(),
          setViewMode: jest.fn(),
          selectNode: jest.fn(),
          issueCanvasFocusRequest: jest.fn(),
          clearCanvasFocusRequest: jest.fn(),
          navigateToNodeInMapView,
          pendingNavigation: { mapId: "map-2", sessionNumber: 3, nodeId: 10, token: 7 },
          onConsumePendingNavigation,
          onSwitchToMapTarget: jest.fn(),
        }),
      { initialProps: { hydrated: false } },
    );

    expect(navigateToNodeInMapView).not.toHaveBeenCalled();

    rerender({ hydrated: true });
    expect(navigateToNodeInMapView).toHaveBeenCalledTimes(1);
    expect(navigateToNodeInMapView).toHaveBeenCalledWith(10);
    expect(onConsumePendingNavigation).toHaveBeenCalledWith(7);

    // 同じトークンでは再実行しない
    rerender({ hydrated: true });
    expect(navigateToNodeInMapView).toHaveBeenCalledTimes(1);
  });

  it("pending 到着時は navigateToArrivalInMapView だけを呼び通常ナビは呼ばない", () => {
    const nodes = [createTestNode({ id: 10, parentId: null, label: "対象" })];
    const navigateToNodeInMapView = jest.fn();
    const navigateToArrivalInMapView = jest.fn();
    const onConsumePendingNavigation = jest.fn();

    const { rerender } = renderHook(
      ({ hydrated }: { hydrated: boolean }) =>
        useCrossMapNavigation({
          mapId: "map-2",
          sessionNumber: 3,
          hydrated,
          nodes,
          documentRevision: 1,
          viewMode: "map",
          initialViewportScale: 1,
          resolutionMode: "all",
          collapseIndex: createNodeCollapseIndex(nodes),
          collapsedNodeIds: new Set(),
          expandNodes: jest.fn(),
          setResolutionMode: jest.fn(),
          resetViewportScale: jest.fn(),
          setViewportScale: jest.fn(),
          setViewMode: jest.fn(),
          selectNode: jest.fn(),
          issueCanvasFocusRequest: jest.fn(),
          clearCanvasFocusRequest: jest.fn(),
          navigateToNodeInMapView,
          navigateToArrivalInMapView,
          pendingNavigation: { mapId: "map-2", sessionNumber: 3, nodeId: 10, token: 11 },
          onConsumePendingNavigation,
          onSwitchToMapTarget: jest.fn(),
        }),
      { initialProps: { hydrated: false } },
    );

    rerender({ hydrated: true });
    expect(navigateToArrivalInMapView).toHaveBeenCalledTimes(1);
    expect(navigateToArrivalInMapView).toHaveBeenCalledWith(10);
    expect(navigateToNodeInMapView).not.toHaveBeenCalled();
    expect(onConsumePendingNavigation).toHaveBeenCalledWith(11);
  });
});
