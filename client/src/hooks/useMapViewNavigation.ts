import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { isSameMapView, resolveRestoredMapView } from "@/domain/nodes/mapViewSnapshot";
import type { NodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import type { NodeSelectionState } from "@/domain/selection/nodeSelection";
import { useMapViewHistory } from "@/hooks/useMapViewHistory";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { Node } from "@/types/node";
import type { NodeFocusRequest } from "@/types/nodeFocusRequest";
import type { ResolutionFilterMode, ResolutionLevel } from "@/types/nodeResolution";
import { INITIAL_VIEWPORT, isValidViewport, type ScreenSize, type Viewport } from "@/types/viewport";

/** キャンバス側ビューポート操作の接点。MapStage 実装詳細には依存しない。 */
export type MapViewportHandle = {
  getViewport: () => Viewport;
  getScreenSize: () => ScreenSize | null;
  applyViewport: (next: Viewport, beforeChange?: () => void) => boolean;
};

type Options = {
  mapId: string;
  resetRevision: number;
  documentRevision: number;
  nodes: readonly Node[];
  collapseIndex: NodeCollapseIndex | null;
  viewportHandleRef: RefObject<MapViewportHandle | null>;
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  restoreSelection: (selection: NodeSelectionState) => void;
  focusRootId: number | null;
  setFocusRootId: (id: number | null) => void;
  collapsedNodeIds: ReadonlySet<number>;
  setCollapsedNodeIds: (ids: ReadonlySet<number>) => void;
  resolutionMode: ResolutionFilterMode;
  getAutoResolutionLevel: (scale: number) => ResolutionLevel;
  restoreResolution: (mode: ResolutionFilterMode, level: ResolutionLevel, scale: number) => void;
  setViewportScale: (scale: number) => void;
  issueRequest: (id: number) => NodeFocusRequest;
  clearRequest: () => void;
  isCurrentRequest: (request: NodeFocusRequest) => boolean;
  finishRequest: (request: NodeFocusRequest) => void;
};

export function useMapViewNavigation({
  mapId, resetRevision, documentRevision, nodes, collapseIndex, viewportHandleRef,
  selectedNodeId, selectedNodeIds, restoreSelection, focusRootId, setFocusRootId,
  collapsedNodeIds, setCollapsedNodeIds, resolutionMode, getAutoResolutionLevel,
  restoreResolution, setViewportScale, issueRequest, clearRequest, isCurrentRequest, finishRequest,
}: Options) {
  const pendingViewFocusRef = useRef<{ request: NodeFocusRequest; before: MapViewSnapshot } | null>(null);
  const outlineViewportRef = useRef(INITIAL_VIEWPORT);
  const outlineJumpBeforeRef = useRef<MapViewSnapshot | null>(null);

  const captureView = useCallback((): MapViewSnapshot => {
    const viewport = viewportHandleRef.current?.getViewport() ?? outlineViewportRef.current;
    return {
      viewport,
      selectedNodeId,
      selectedNodeIds: [...selectedNodeIds],
      focusRootId,
      collapsedNodeIds: [...collapsedNodeIds],
      resolutionMode,
      autoResolutionLevel: getAutoResolutionLevel(viewport.scale),
    };
  }, [viewportHandleRef, selectedNodeId, selectedNodeIds, focusRootId, collapsedNodeIds, resolutionMode, getAutoResolutionLevel]);

  const clearCanvasFocus = useCallback(() => {
    pendingViewFocusRef.current = null;
    outlineJumpBeforeRef.current = null;
    clearRequest();
  }, [clearRequest]);

  useLayoutEffect(() => {
    pendingViewFocusRef.current = null;
    outlineJumpBeforeRef.current = null;
  }, [documentRevision]);

  useLayoutEffect(() => {
    outlineViewportRef.current = INITIAL_VIEWPORT;
    clearCanvasFocus();
  }, [mapId, resetRevision, clearCanvasFocus]);

  const captureBeforeNavigation = useCallback(() => {
    // 未確定の検索を上書きした場合は、検索による表示変更もまとめて戻す。
    const pending = pendingViewFocusRef.current;
    return pending && isCurrentRequest(pending.request) ? pending.before : captureView();
  }, [captureView, isCurrentRequest]);

  const applyView = useCallback((
    snapshot: MapViewSnapshot,
    beforeChange?: (before: MapViewSnapshot) => void,
  ): boolean => {
    const stage = viewportHandleRef.current;
    if (!stage?.getScreenSize() || !isValidViewport(snapshot.viewport)) return false;

    const before = captureBeforeNavigation();
    const current = captureView();
    const { normalized, collapsedIds, selection } = resolveRestoredMapView(snapshot, nodes, collapseIndex);
    clearCanvasFocus();
    if (beforeChange && !isSameMapView(before, normalized)) beforeChange(before);
    if (isSameMapView(current, normalized)) return true;

    stage.applyViewport(normalized.viewport);
    setViewportScale(normalized.viewport.scale);
    restoreResolution(normalized.resolutionMode, normalized.autoResolutionLevel, normalized.viewport.scale);
    setCollapsedNodeIds(collapsedIds);
    setFocusRootId(normalized.focusRootId);
    restoreSelection(selection);
    return true;
  }, [
    viewportHandleRef, captureBeforeNavigation, captureView, clearCanvasFocus, nodes, collapseIndex, setViewportScale,
    restoreResolution, setCollapsedNodeIds, setFocusRootId, restoreSelection,
  ]);

  const { canGoBack, canGoForward, recordNavigation, travel } = useMapViewHistory(
    mapId, resetRevision, captureBeforeNavigation, applyView,
  );
  const recordBeforeViewportChange = useCallback(() => {
    recordNavigation(captureBeforeNavigation());
    clearCanvasFocus();
  }, [recordNavigation, captureBeforeNavigation, clearCanvasFocus]);

  const issueViewFocus = useCallback((nodeId: number, before: MapViewSnapshot | null) => {
    const request = issueRequest(nodeId);
    pendingViewFocusRef.current = before ? { request, before } : null;
  }, [issueRequest]);

  const onFocusRequestApplied = useCallback((request: NodeFocusRequest) => {
    const pending = pendingViewFocusRef.current;
    if (!isCurrentRequest(request)) return;
    finishRequest(request);
    pendingViewFocusRef.current = null;
    if (pending?.request.sequence === request.sequence && !isSameMapView(pending.before, captureView())) {
      recordNavigation(pending.before);
    }
  }, [captureView, finishRequest, isCurrentRequest, recordNavigation]);

  const onFocusRequestDiscarded = useCallback((request: NodeFocusRequest) => {
    if (!isCurrentRequest(request)) return;
    finishRequest(request);
    pendingViewFocusRef.current = null;
  }, [finishRequest, isCurrentRequest]);

  const rememberOutlineViewport = useCallback(() => {
    outlineViewportRef.current = captureView().viewport;
  }, [captureView]);

  const captureBeforeOutlineJump = useCallback(() => {
    outlineJumpBeforeRef.current = captureView();
  }, [captureView]);

  const issueOutlineJumpFocus = useCallback((nodeId: number) => {
    issueViewFocus(nodeId, outlineJumpBeforeRef.current);
    outlineJumpBeforeRef.current = null;
  }, [issueViewFocus]);

  return {
    captureView, applyView, recordNavigation, canGoBack, canGoForward, travel,
    clearCanvasFocus, recordBeforeViewportChange, captureBeforeNavigation, issueViewFocus,
    onFocusRequestApplied, onFocusRequestDiscarded, rememberOutlineViewport, captureBeforeOutlineJump, issueOutlineJumpFocus,
  };
}
