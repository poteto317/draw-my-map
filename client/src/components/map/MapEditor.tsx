"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { BrokenMapLinksDialog } from "@/components/layout/BrokenMapLinksDialog";
import { CrossMapSearchDialog } from "@/components/layout/CrossMapSearchDialog";
import { EditorViewModeControl, type EditorViewMode } from "@/components/layout/EditorViewModeControl";
import { ExportScopeControl } from "@/components/layout/ExportScopeControl";
import { OutlineEditor } from "@/components/outline/OutlineEditor";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  canUseSelectionScope,
  resolveExportFormatControls,
} from "@/domain/exportScope/exportFormatAvailability";
import type { ExportScope } from "@/domain/exportScope/exportScope";
import { normalizeExportForestParents } from "@/domain/exportScope/normalizeExportForestParents";
import { resolveExportNodes } from "@/domain/exportScope/resolveExportNodes";
import { resolveSelectionTargetIds } from "@/domain/exportScope/resolveSelectionTargetIds";
import { summarizeSelectionImportance } from "@/domain/nodes/selectionImportanceSummary";
import { buildOutlineRows } from "@/domain/outline/outlineRows";
import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { useCrossMapCorpus } from "@/hooks/useCrossMapCorpus";
import { useCrossMapDialogs } from "@/hooks/useCrossMapDialogs";
import { useCrossMapNavigation } from "@/hooks/useCrossMapNavigation";
import { useOutlineEditorActions } from "@/hooks/useOutlineEditorActions";
import { useOutlineCanvasReturn } from "@/hooks/useOutlineCanvasReturn";
import { useRevisionScopedNodeRequest } from "@/hooks/useRevisionScopedNodeRequest";
import { BranchMoveControl } from "@/components/layout/BranchMoveControl";
import { BranchNavigationControls } from "@/components/layout/BranchNavigationControls";
import { CommandPaletteControl } from "@/components/layout/CommandPaletteControl";
import { CommandPaletteDialog } from "@/components/layout/CommandPaletteDialog";
import { MapViewBookmarkControls } from "@/components/layout/MapViewBookmarkControls";
import { BranchMoveDialog } from "@/components/layout/BranchMoveDialog";
import { LabelReplaceControl } from "@/components/layout/LabelReplaceControl";
import { LabelReplaceDialog } from "@/components/layout/LabelReplaceDialog";
import { NodeMergeControl } from "@/components/layout/NodeMergeControl";
import { NodeMergeDialog } from "@/components/layout/NodeMergeDialog";
import { NodeSplitControl } from "@/components/layout/NodeSplitControl";
import { NodeSplitDialog } from "@/components/layout/NodeSplitDialog";
import {
  PartsLibraryDialog,
  type PartsLibraryDialogMode,
} from "@/components/layout/PartsLibraryDialog";
import { useBranchMoveDialog } from "@/hooks/useBranchMoveDialog";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";
import { useLabelReplaceDialog } from "@/hooks/useLabelReplaceDialog";
import { useNodeMergeDialog } from "@/hooks/useNodeMergeDialog";
import { useNodeSplitDialog } from "@/hooks/useNodeSplitDialog";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { useNodes } from "@/hooks/useNodes";
import { useNodePins } from "@/hooks/useNodePins";
import { usePartsLibrary } from "@/hooks/usePartsLibrary";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppWorkspace } from "@/components/layout/AppWorkspace";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";
import { DepthLimitControl } from "@/components/layout/DepthLimitControl";
import { DepthLimitEmptyHint } from "@/components/layout/DepthLimitEmptyHint";
import { HighlightModeControl } from "@/components/layout/HighlightModeControl";
import { NodePinControls } from "@/components/layout/NodePinControls";
import { ResolutionFilterSelector } from "@/components/layout/ResolutionFilterSelector";
import { MapHeaderLayoutControls } from "@/components/layout/MapHeaderLayoutControls";
import { WheelZoomSensitivityControl } from "@/components/layout/WheelZoomSensitivityControl";
import { MapImageExportControls } from "@/components/layout/MapImageExportControls";
import { OutlineExportControls } from "@/components/layout/OutlineExportControls";
import { MapHistoryControls } from "@/components/layout/MapHistoryControls";
import { NodeCollapseControl } from "@/components/layout/NodeCollapseControl";
import { NodeDuplicateControl } from "@/components/layout/NodeDuplicateControl";
import { NodeIndentControl } from "@/components/layout/NodeIndentControl";
import { NodeOnlyDeleteControl } from "@/components/layout/NodeOnlyDeleteControl";
import { NodeParentInsertControl } from "@/components/layout/NodeParentInsertControl";
import { NodeSiblingOrderControl } from "@/components/layout/NodeSiblingOrderControl";
import { MapPersistenceControls } from "@/components/layout/MapPersistenceControls";
import {
  hasOperationNotice,
  MapOperationNoticeList,
} from "@/components/layout/MapOperationNoticeList";
import { MapConflictNotice } from "@/components/layout/MapConflictNotice";
import { MapConflictConfirmDialog } from "@/components/layout/MapConflictConfirmDialog";
import { OutlineImportControl } from "@/components/layout/OutlineImportControl";
import { OutlineImportDialog } from "@/components/layout/OutlineImportDialog";
import { resolveOutlineParentCandidate } from "@/components/layout/outlineParentCandidate";
import { NodeSearchBox } from "@/components/layout/NodeSearchBox";
import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";
import { executeCommandPaletteActive } from "@/components/map/commandPaletteExecution";
import {
  openCommandPaletteDialog,
  runCommandPaletteImmediateCore,
} from "@/components/map/commandPaletteCoreDispatch";
import { isRestorableFocusTarget } from "@/components/map/isRestorableFocusTarget";
import { resolveOutlineInitialFocusTarget } from "@/components/map/resolveOutlineInitialFocusTarget";
import { MapStage, type MapStageViewportHandle } from "@/components/map/MapStage";
import { Minimap } from "@/components/map/Minimap";
import { MapViewportZoomControls, ZOOM_FACTOR } from "@/components/map/MapViewportZoomControls";
import { clampViewportScale, INITIAL_VIEWPORT, zoomViewportAt } from "@/components/map/mapViewport";
import type { ViewportFrame } from "@/components/map/useViewportFrameNotification";
import { focusViewportOnWorldPoint } from "@/components/map/nodeViewportFocus";
import { useCommandPaletteShortcut } from "@/components/map/useCommandPaletteShortcut";
import { useCrossMapSearchShortcut } from "@/components/map/useCrossMapSearchShortcut";
import { buildCommandAvailabilityContext } from "@/domain/commands/buildCommandAvailabilityContext";
import { filterCommandCatalog } from "@/domain/commands/filterCommandCatalog";
import type { CommandId } from "@/domain/commands/commandTypes";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";
import { useMapHeaderLayoutControls } from "@/hooks/useMapHeaderLayoutControls";
import { useUiPrefs } from "@/hooks/useUiPrefs";
import { useMapHistoryShortcuts } from "@/components/map/useMapHistoryShortcuts";
import { useMapImageExport } from "@/hooks/useMapImageExport";
import { useMapJsonExport } from "@/hooks/useMapJsonExport";
import { useOutlineExport } from "@/hooks/useOutlineExport";
import { useMapDepthLimit } from "@/hooks/useMapDepthLimit";
import { useMapHighlightMode } from "@/hooks/useMapHighlightMode";
import { useMapPersistence } from "@/hooks/useMapPersistence";
import { useNodeDuplicationAction } from "@/hooks/useNodeDuplicationAction";
import { useResettingMapReplacement } from "@/hooks/useResettingMapReplacement";
import { useMapViewNavigation } from "@/hooks/useMapViewNavigation";
import { useMapViewBookmarks } from "@/hooks/useMapViewBookmarks";
import { useMapResolutionFilter } from "@/hooks/useMapResolutionFilter";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import { useNodeLabelSearch } from "@/hooks/useNodeLabelSearch";
import { useMapDisplayState } from "@/hooks/useMapDisplayState";
import { useBranchCollapse } from "@/hooks/useBranchCollapse";
import { useBranchFocus } from "@/hooks/useBranchFocus";
import { useNodeSearchNavigation } from "@/hooks/useNodeSearchNavigation";
import { useOutlineImport } from "@/hooks/useOutlineImport";
import { useSiblingReorderAction } from "@/hooks/useSiblingReorderAction";
import { useNodeIndentAction } from "@/hooks/useNodeIndentAction";
import { useNodeOnlyDeletionAction } from "@/hooks/useNodeOnlyDeletionAction";
import { useNodeParentInsertionAction } from "@/hooks/useNodeParentInsertionAction";
import { filterSelectedFitNodes } from "@/domain/nodes/fitSelection";
import { buildNodeBreadcrumb } from "@/domain/nodes/nodeBreadcrumb";
import { collectSubtreeIds } from "@/domain/nodes/nodeCollapse";
import { subtreeCollapseActionAvailability } from "@/domain/nodes/subtreeCollapseAvailability";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";
import type { PendingMapNodeNavigation } from "@/types/pendingMapNavigation";

const CLIPBOARD_OPERATION_HINT = "枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）";
const LAYOUT_FAILED_NOTICE: OperationNotice = {
  kind: "status",
  message: "表示用の自動配置ができないため、元の位置で表示しています。",
};

type MapEditorProps = {
  mapId: string;
  mapCreatedAt?: string;
  mapName: string;
  storageSession: MapStorageSession;
  storageMode: "persistent" | "protected";
  mapControls: ReactNode;
  // シェルが保護モードへ移ったときのフォーカスの戻し先。ボタンはこの編集画面が描画する
  exportButtonRef: RefObject<HTMLButtonElement | null>;
  mapMoveTargets: readonly MapIndexEntry[];
  onMoveBranchToMap: (rootId: number, targetMapId: string) => MapLibraryOperationResult;
  onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult;
  shortcutsEnabled: boolean;
  // 画面の外のダイアログで最後にマウスでクリックした時刻。ダイアログが1回目のクリックで閉じると、
  // ダブルクリックの2回目と dblclick が MapStage のキャンバスへ届くので、メニューの項目と同じ時間窓で無視する
  dialogMouseClickedAtRef: RefObject<number | null>;
  pendingNavigation: PendingMapNodeNavigation | null;
  onConsumePendingNavigation: (token: number) => void;
  onSwitchToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
  brokenLinksDialogRequest: number;
  onBrokenLinksDialogClosed: () => void;
};

// 1つのマップの編集画面。マップを切り替えるときは親が key を変えて再マウントし、履歴と表示状態を破棄する。
// shortcutsEnabled が false の間（ダイアログ表示中）は、根を inert にしてショートカットも止める。
// 箇条書きの取り込みのダイアログを開いている間も同じように止め、ダイアログは根の兄弟に描いて inert の外に置く
export function MapEditor({
  mapId,
  mapCreatedAt = "",
  mapName,
  storageSession,
  storageMode,
  mapControls,
  exportButtonRef,
  mapMoveTargets,
  onMoveBranchToMap,
  onSaveCurrentAsNewMap,
  shortcutsEnabled,
  dialogMouseClickedAtRef,
  pendingNavigation,
  onConsumePendingNavigation,
  onSwitchToMapTarget,
  brokenLinksDialogRequest,
  onBrokenLinksDialogClosed,
}: MapEditorProps) {
  const {
    nodes,
    selectedNodeId,
    selectedNodeIds,
    layoutMode,
    treeDirection,
    layoutSpacing,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    restoreSelection,
    toggleNodeSelection,
    selectNodeRange,
    setSelectionFromMarquee,
    clearSelection,
    pruneSelectionToVisible,
    updateNodeLabel,
    updateNodesImportance,
    moveNode,
    connectNodes,
    duplicateSubtree,
    copySubtree,
    pasteSubtree,
    insertSubtree,
    insertForest,
    reorderSibling,
    changeNodeIndent,
    insertParentNode,
    moveBranch,
    updateNodeLabels,
    splitNode,
    mergeNodes,
    deleteNode,
    deleteNodeOnly,
    setLayoutMode,
    setTreeDirection,
    setLayoutSpacing,
    replaceMap,
    attachIllustration,
    removeIllustration,
    previewNodeNote,
    addNodeLink,
    removeNodeLink,
    addNodeTag,
    removeNodeTag,
    addNodeSource,
    removeNodeSource,
    addNodeMapLink,
    removeNodeMapLink,
    commitManualNodes,
    toggleNodeEditLock,
    lockNodeSubtree,
    unlockNodeSubtree,
    setLabelFontSize,
    toggleLabelBold,
    toggleLabelUnderline,
    setNodeIcon,
    setNodeKind,
    beginMoveHistory,
    documentRevision,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useNodes();
  const [viewMode, setViewMode] = useState<EditorViewMode>("map");
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [scopedJsonNotice, setScopedJsonNotice] = useState<OperationNotice | null>(null);
  const { maxDepth, setMaxDepth, depthVisibleNodeIds } = useMapDepthLimit(nodes);
  const canvasFocus = useRevisionScopedNodeRequest(documentRevision);
  const [viewportScale, setViewportScale] = useState(1);
  const [viewportFrame, setViewportFrame] = useState<ViewportFrame | null>(null);
  const { replaceMapAndReset, resetRevision } = useResettingMapReplacement(replaceMap);
  const resolutionFilter = useMapResolutionFilter({
    nodes,
    scale: viewportScale,
    resetRevision,
    resetScale: INITIAL_VIEWPORT.scale,
  });
  const { prefs: uiPrefs, setWheelZoomSensitivity } = useUiPrefs();
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  // 一括編集の対象。アウトラインは単一選択のため、キャンバスで残った複数選択を見えないまま変えない
  const importanceTargetIds = useMemo<readonly number[]>(() => {
    if (viewMode === "map") return selectedNodeIds;
    return selectedNodeId === null ? [] : [selectedNodeId];
  }, [viewMode, selectedNodeIds, selectedNodeId]);
  const importanceSummary = summarizeSelectionImportance(nodes, importanceTargetIds);
  const { headerLayoutControls, layoutSnapPrefs } = useMapHeaderLayoutControls({
    viewMode,
    isProtectedMode: storageMode === "protected",
    nodes,
    layoutMode,
    treeDirection,
    layoutSpacing,
    selectedNodeId,
    selectedNodeIds,
    selectedNodeLocked: selectedNode?.locked === true,
    setTreeDirection,
    setLayoutSpacing,
    commitManualNodes,
    toggleNodeEditLock,
    lockNodeSubtree,
    unlockNodeSubtree,
    setLabelFontSize,
    toggleLabelBold,
    toggleLabelUnderline,
  });
  const branchCollapse = useBranchCollapse({ nodes, documentRevision });
  const { expandNodes, index: collapseIndex } = branchCollapse;
  const { focusRootId, setFocusRootId, focusVisibleNodeIds, clearFocusOutsideBranch } = useBranchFocus({
    mapId, resetRevision, collapseIndex, expandNodes,
  });
  const breadcrumb = useMemo(
    () => buildNodeBreadcrumb(collapseIndex, selectedNodeId),
    [collapseIndex, selectedNodeId],
  );
  const selectedBranchIds = useMemo(() => (
    collapseIndex && selectedNodeId !== null ? collectSubtreeIds(collapseIndex, selectedNodeId) : null
  ), [collapseIndex, selectedNodeId]);
  const selectedInternalIds = useMemo(
    () => Array.from(selectedBranchIds ?? []).filter(branchCollapse.canToggle),
    [branchCollapse.canToggle, selectedBranchIds],
  );
  const { canExpand: canExpandSelectedBranch, canCollapse: canCollapseSelectedBranch } = useMemo(
    () => subtreeCollapseActionAvailability(selectedInternalIds, branchCollapse.collapsedNodeIds),
    [branchCollapse.collapsedNodeIds, selectedInternalIds],
  );
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const viewportHandleRef = useRef<MapStageViewportHandle>(null);
  const expandNodesRef = useRef(expandNodes);
  useLayoutEffect(() => {
    expandNodesRef.current = expandNodes;
  }, [expandNodes]);
  const addChildNodeExpanding = useCallback((parentId: number) => {
    const createdId = addChildNode(parentId);
    if (createdId !== null) expandNodesRef.current([parentId]);
    return createdId;
  }, [addChildNode]);
  const displayState = useMapDisplayState({
    nodes,
    layoutMode,
    treeDirection,
    layoutSpacing,
    collapseVisibleNodeIds: branchCollapse.collapseVisibleNodeIds,
    resolutionVisibleNodeIds: resolutionFilter.visibleNodeIds,
    depthVisibleNodeIds,
    focusVisibleNodeIds,
    focusRootId,
  });
  const selectedFitNodes = useMemo(
    () => filterSelectedFitNodes(displayState.fitNodes, displayState.visibleNodeIds, selectedNodeIds),
    [displayState.fitNodes, displayState.visibleNodeIds, selectedNodeIds],
  );
  const viewNavigation = useMapViewNavigation({
    mapId, resetRevision, documentRevision, nodes, collapseIndex, viewportHandleRef,
    selectedNodeId, selectedNodeIds, restoreSelection, focusRootId, setFocusRootId,
    collapsedNodeIds: branchCollapse.collapsedNodeIds, setCollapsedNodeIds: branchCollapse.setCollapsedNodeIds,
    resolutionMode: resolutionFilter.mode, getAutoResolutionLevel: resolutionFilter.getAutoResolutionLevel,
    restoreResolution: resolutionFilter.restoreResolution, setViewportScale,
    issueRequest: canvasFocus.issueRequest, clearRequest: canvasFocus.clearRequest,
    isCurrentRequest: canvasFocus.isCurrentRequest, finishRequest: canvasFocus.finishRequest,
  });
  const { captureBeforeNavigation, issueViewFocus, recordBeforeViewportChange } = viewNavigation;

  const zoomMapViewportFromCenter = useCallback((factor: number) => {
    const handle = viewportHandleRef.current;
    if (!handle) return;
    const screen = handle.getScreenSize();
    if (!screen) return;
    const current = handle.getViewport();
    const anchor = { x: screen.width / 2, y: screen.height / 2 };
    const requestedScale = clampViewportScale(current.scale * factor);
    const next = zoomViewportAt(current, anchor, requestedScale);
    handle.applyViewport(next);
  }, []);
  const handleZoomIn = useCallback(() => zoomMapViewportFromCenter(ZOOM_FACTOR), [zoomMapViewportFromCenter]);
  const handleZoomOut = useCallback(() => zoomMapViewportFromCenter(1 / ZOOM_FACTOR), [zoomMapViewportFromCenter]);
  const handleViewportFrameChange = useCallback((frame: ViewportFrame) => {
    setViewportFrame(frame);
  }, []);
  const handleMinimapPan = useCallback((worldPoint: { x: number; y: number }) => {
    const handle = viewportHandleRef.current;
    if (!handle) return;
    const screen = handle.getScreenSize();
    if (!screen) return;
    const next = focusViewportOnWorldPoint(handle.getViewport(), worldPoint, screen);
    handle.applyViewport(next);
  }, []);

  const nodeSearch = useNodeLabelSearch({
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
  });
  const searchHitIds = useMemo(
    () => new Set(nodeSearch.matches.map((match) => match.nodeId)),
    [nodeSearch.matches],
  );
  const { highlightMode, setHighlightMode, highlightNodeIds } = useMapHighlightMode(
    nodes,
    displayState.visibleNodeIds,
    searchHitIds,
    selectedNodeIds,
  );
  const { navigateToNode: revealSearchTarget, notice: nodeSearchNotice } = useNodeSearchNavigation({
    issueFocusRequest: canvasFocus.issueRequest,
    nodes,
    resolutionVisibleNodeIds: resolutionFilter.visibleNodeIds,
    collapseIndex: branchCollapse.index,
    collapsedNodeIds: branchCollapse.collapsedNodeIds,
    expandNodes: branchCollapse.expandNodes,
    documentRevision,
    setResolutionMode: resolutionFilter.setMode,
    selectNode,
    focusRootId,
    onValidTarget: clearFocusOutsideBranch,
    maxDepth,
    setMaxDepth,
  });
  const navigateToNode = useCallback((nodeId: number, record = true) => {
    const before = record ? captureBeforeNavigation() : null;
    return revealSearchTarget(nodeId, (id) => issueViewFocus(id, before));
  }, [captureBeforeNavigation, issueViewFocus, revealSearchTarget]);
  const navigateToArrival = useCallback((nodeId: number) => navigateToNode(nodeId, false), [navigateToNode]);

  const persistence = useMapPersistence({
    nodes,
    layoutMode,
    replaceMap: replaceMapAndReset,
    storageSession,
    storageMode,
    mapName,
    onSaveCurrentAsNewMap,
  });
  const selectionTargetIds = useMemo(
    () => resolveSelectionTargetIds(viewMode, selectedNodeId, selectedNodeIds),
    [viewMode, selectedNodeId, selectedNodeIds],
  );
  const selectionScopeAvailable = canUseSelectionScope(selectionTargetIds);
  /* eslint-disable react-hooks/set-state-in-effect -- 選択が外れたときの書き出し対象フォールバック */
  useEffect(() => {
    if (exportScope === "selection" && !selectionScopeAvailable) {
      setExportScope("all");
    }
  }, [exportScope, selectionScopeAvailable]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const exportNodes = useMemo(
    () => resolveExportNodes(
      exportScope,
      nodes,
      displayState.visibleNodeIds,
      selectionTargetIds,
    ),
    [exportScope, nodes, displayState.visibleNodeIds, selectionTargetIds],
  );
  const exportDocumentNodes = useMemo(
    () => (exportScope === "all"
      ? exportNodes
      : normalizeExportForestParents(exportNodes)),
    [exportScope, exportNodes],
  );
  const imageExport = useMapImageExport({
    nodes: exportNodes,
    mapName,
  });
  const scopedJsonSnapshot = useMemo(
    () => serializeMapDocument(createMapDocument(exportDocumentNodes, layoutMode)),
    [exportDocumentNodes, layoutMode],
  );
  const exportScopedJson = useMapJsonExport({
    currentSnapshot: scopedJsonSnapshot,
    mapName,
    publishNotice: setScopedJsonNotice,
  });
  const exportJsonAll = persistence.exportJson;
  const handleExportJson = useCallback(() => {
    if (exportScope === "all") {
      exportJsonAll();
      return;
    }
    exportScopedJson();
  }, [exportScope, exportJsonAll, exportScopedJson]);
  const { generation, generateIllustration, dismissGeneration } = useIllustrationGeneration(nodes, documentRevision);
  const duplication = useNodeDuplicationAction({
    selectedNodeId: selectedNode?.id ?? null,
    documentRevision,
    duplicateSubtree,
  });
  const {
    notice: clipboardNotice,
    publishNotice: publishClipboardNotice,
  } = useRevisionScopedNotice(documentRevision);
  // 枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入・ノードだけ削除）。9系統目
  const {
    notice: treeEditNotice,
    publishNotice: publishTreeEditNotice,
    clearNotice: clearTreeEditNotice,
  } = useRevisionScopedNotice(documentRevision);
  const [partsDialogMode, setPartsDialogMode] = useState<PartsLibraryDialogMode | null>(null);
  const partsLibrary = usePartsLibrary({
    storage: storageSession.storage,
    nodes,
    selectionTargetIds,
    insertSubtree,
    publishNotice: publishTreeEditNotice,
  });
  const nodePins = useNodePins({
    storage: storageSession.storage,
    mapId,
    nodes,
    selectionTargetIds,
    publishNotice: publishTreeEditNotice,
    navigateToNode,
  });
  const { corpus, refreshCorpus } = useCrossMapCorpus({
    maps: mapMoveTargets,
    currentMapId: mapId,
    currentMapName: mapName,
    currentNodes: nodes,
    storage: storageSession.storage,
    storageMode,
  });
  const { navigationNotice, navigateToMapTarget } = useCrossMapNavigation({
    mapId,
    sessionNumber: storageSession.sessionNumber,
    hydrated: persistence.hydrated,
    nodes,
    documentRevision,
    viewMode,
    initialViewportScale: INITIAL_VIEWPORT.scale,
    resolutionMode: resolutionFilter.mode,
    collapseIndex: branchCollapse.index,
    collapsedNodeIds: branchCollapse.collapsedNodeIds,
    expandNodes: branchCollapse.expandNodes,
    setResolutionMode: resolutionFilter.setMode,
    resetViewportScale: resolutionFilter.resetViewportScale,
    setViewportScale,
    setViewMode,
    selectNode,
    issueCanvasFocusRequest: viewNavigation.issueOutlineJumpFocus,
    clearCanvasFocusRequest: viewNavigation.clearCanvasFocus,
    onBeforeLocalOutlineJump: viewNavigation.captureBeforeOutlineJump,
    navigateToNodeInMapView: navigateToNode,
    navigateToArrivalInMapView: navigateToArrival,
    focusRootId,
    onValidOutlineTarget: clearFocusOutsideBranch,
    pendingNavigation,
    onConsumePendingNavigation,
    onSwitchToMapTarget,
  });
  const crossMapSearchButtonRef = useRef<HTMLButtonElement>(null);
  const crossMapDialogs = useCrossMapDialogs({
    storageMode,
    brokenLinksDialogRequest,
    crossMapSearchButtonRef,
    refreshCorpus,
    onNavigateToMapTarget: navigateToMapTarget,
    onBrokenLinksDialogClosed,
  });
  const handleAddMapLink = useCallback(
    (nodeId: number, input: { targetMapId: string; targetNodeId?: number }) =>
      addNodeMapLink(nodeId, mapId, input),
    [addNodeMapLink, mapId],
  );
  const outlineImport = useOutlineImport({
    selectedNodeId,
    documentRevision,
    insertForest,
    expandNodes: branchCollapse.expandNodes,
  });
  const siblingReorder = useSiblingReorderAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    reorderSibling,
    publishNotice: publishTreeEditNotice,
  });
  const nodeIndent = useNodeIndentAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    changeNodeIndent,
    expandNodes: branchCollapse.expandNodes,
    publishNotice: publishTreeEditNotice,
  });
  const nodeParentInsertion = useNodeParentInsertionAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    documentRevision,
    insertParentNode,
    publishNotice: publishTreeEditNotice,
    clearNotice: clearTreeEditNotice,
  });
  const nodeOnlyDeletion = useNodeOnlyDeletionAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    deleteNodeOnly,
    publishNotice: publishTreeEditNotice,
  });
  const branchMove = useBranchMoveDialog({
    mapId,
    mapMoveTargets,
    nodes,
    selectedNodeId,
    documentRevision,
    moveBranch: (sourceId, parentId) => {
      const result = moveBranch(sourceId, parentId);
      if (result.ok && focusVisibleNodeIds && sourceId !== focusRootId
        && (parentId === null || !focusVisibleNodeIds.has(parentId))) {
        setFocusRootId(null);
      }
      return result;
    },
    onMoveBranchToMap,
    expandNodes: branchCollapse.expandNodes,
    resolutionVisibleNodeIds: resolutionFilter.visibleNodeIds,
    setResolutionMode: resolutionFilter.setMode,
    publishNotice: publishTreeEditNotice,
  });
  const branchMoveButtonRef = useRef<HTMLButtonElement>(null);
  const { focusRequest: branchMoveFocusRequest, consumeFocusRequest: consumeBranchMoveFocusRequest } = branchMove;
  useLayoutEffect(() => {
    if (branchMoveFocusRequest !== "header") return;
    // 開いている間の置換で選択が外れるとボタンは無効になるので、常に押せる「JSON書き出し」へ送る
    const button = branchMoveButtonRef.current;
    (button?.disabled ? exportButtonRef.current : button)?.focus();
    consumeBranchMoveFocusRequest();
  }, [branchMoveFocusRequest, consumeBranchMoveFocusRequest, exportButtonRef]);
  const labelReplace = useLabelReplaceDialog({
    mapId,
    nodes,
    selectedNodeIds,
    documentRevision,
    updateNodeLabels,
    publishNotice: publishTreeEditNotice,
  });
  const labelReplaceButtonRef = useRef<HTMLButtonElement>(null);
  const { focusRequest: labelReplaceFocusRequest, consumeFocusRequest: consumeLabelReplaceFocusRequest } = labelReplace;
  useLayoutEffect(() => {
    if (labelReplaceFocusRequest !== "header") return;
    // ノードが無くなるとボタンは無効になるので、常に押せる「JSON書き出し」へ送る
    const button = labelReplaceButtonRef.current;
    (button?.disabled ? exportButtonRef.current : button)?.focus();
    consumeLabelReplaceFocusRequest();
  }, [labelReplaceFocusRequest, consumeLabelReplaceFocusRequest, exportButtonRef]);
  const nodeSplit = useNodeSplitDialog({
    mapId,
    nodes,
    selectedNodeId,
    visibleNodeIds: displayState.visibleNodeIds,
    documentRevision,
    splitNode,
    publishNotice: publishTreeEditNotice,
  });
  const nodeSplitButtonRef = useRef<HTMLButtonElement>(null);
  // 確定でボタンが無効になったときは、常に押せる「JSON書き出し」へ送る
  const splitFocusFallbacks = useMemo(() => [exportButtonRef], [exportButtonRef]);
  useHeaderFocusReturn({
    focusRequest: nodeSplit.focusRequest,
    consumeFocusRequest: nodeSplit.consumeFocusRequest,
    buttonRef: nodeSplitButtonRef,
    fallbackRefs: splitFocusFallbacks,
  });
  const nodeMerge = useNodeMergeDialog({
    mapId,
    nodes,
    selectedNodeId,
    selectedNodeIds,
    visibleNodeIds: displayState.visibleNodeIds,
    documentRevision,
    mergeNodes,
    publishNotice: publishTreeEditNotice,
  });
  const nodeMergeButtonRef = useRef<HTMLButtonElement>(null);
  // 成功すると選択が 1 件（残したノード）になり、ボタンが無効になる。「JSON書き出し」へ送ると、続けて押した Enter で
  // ダウンロードが始まってしまうので、押しても無害な「ノードを分割」へ送る（無効なら「JSON書き出し」）
  const mergeFocusFallbacks = useMemo(() => [nodeSplitButtonRef, exportButtonRef], [exportButtonRef]);
  useHeaderFocusReturn({
    focusRequest: nodeMerge.focusRequest,
    consumeFocusRequest: nodeMerge.consumeFocusRequest,
    buttonRef: nodeMergeButtonRef,
    fallbackRefs: mergeFocusFallbacks,
  });
  const { moveSelected: moveSelectedSibling } = siblingReorder;
  const moveSelectedSiblingUp = useCallback(() => moveSelectedSibling("up"), [moveSelectedSibling]);
  const moveSelectedSiblingDown = useCallback(() => moveSelectedSibling("down"), [moveSelectedSibling]);
  const { changeSelected: changeSelectedIndent } = nodeIndent;
  const outdentSelected = useCallback(() => changeSelectedIndent("outdent"), [changeSelectedIndent]);
  const indentSelected = useCallback(() => changeSelectedIndent("indent"), [changeSelectedIndent]);
  // 下の effect の依存配列に入れるため、値と関数を取り出しておく
  const { focusRequest: outlineFocusRequest, consumeFocusRequest: consumeOutlineFocusRequest } = outlineImport;
  const outlineImportButtonRef = useRef<HTMLButtonElement>(null);
  const commandPalette = useCommandPalette({ mapId, documentRevision });
  const commandPaletteButtonRef = useRef<HTMLButtonElement>(null);
  const commandPaletteOpenerRef = useRef<HTMLElement | null>(null);
  const nodeSearchInputRef = useRef<HTMLInputElement>(null);
  const {
    notice: commandPaletteNotice,
    publishNotice: publishCommandPaletteNotice,
  } = useRevisionScopedNotice(documentRevision);
  // 入口をすべて同じ値で止める（L-061）。commandPalette.screen === "closed" を積に含める
  const editorShortcutsEnabled = shortcutsEnabled
    && commandPalette.screen === "closed"
    && outlineImport.screen === "closed"
    && branchMove.screen === "closed"
    && labelReplace.screen === "closed"
    && nodeSplit.screen === "closed"
    && nodeMerge.screen === "closed"
    && partsDialogMode === null
    && !crossMapDialogs.crossMapSearchOpen
    && !crossMapDialogs.brokenLinksDialogOpen
    && !persistence.isConfirmOpen;
  useMapHistoryShortcuts({ undo, redo, enabled: editorShortcutsEnabled });
  useCrossMapSearchShortcut({
    enabled: editorShortcutsEnabled,
    onOpen: crossMapDialogs.openCrossMapSearch,
  });
  const outlineModel = useMemo(() => buildOutlineRows(nodes), [nodes]);
  const exportOutlineModel = useMemo(
    () => buildOutlineRows(exportDocumentNodes),
    [exportDocumentNodes],
  );
  const outlineExport = useOutlineExport({ model: exportOutlineModel, mapName });
  const exportFormatControls = useMemo(
    () => resolveExportFormatControls(exportScope, exportNodes.length),
    [exportScope, exportNodes.length],
  );
  const outlineActions = useOutlineEditorActions({
    nodes, selectedNodeId, documentRevision,
    enabled: editorShortcutsEnabled && viewMode === "outline",
    model: outlineModel,
    api: { selectNode, updateNodeLabel, insertForest, addChildNode, addSiblingNode, reorderSibling, changeNodeIndent, deleteNodeOnly },
    expandNodes: branchCollapse.expandNodes,
    publishNotice: publishTreeEditNotice,
  });
  const { returnToCanvas } = useOutlineCanvasReturn({
    nodes, selectedNodeId, documentRevision,
    collapseIndex: branchCollapse.index, collapsedNodeIds: branchCollapse.collapsedNodeIds,
    resolutionMode: resolutionFilter.mode, expandNodes: branchCollapse.expandNodes,
    setResolutionMode: resolutionFilter.setMode, publishNotice: publishTreeEditNotice,
    issueFocusRequest: canvasFocus.issueRequest,
    focusRootId,
    onValidTarget: clearFocusOutsideBranch,
  });
  // パレット実行用コア（editorShortcutsEnabled ガードなし）
  const viewModeRef = useLatestRef(viewMode);
  const pendingViewModeFocusRef = useRef<EditorViewMode | null>(null);
  const pendingMapSearchFocusRef = useRef(false);
  const applyViewMode = useCallback((nextMode: EditorViewMode) => {
    if (nextMode === viewModeRef.current) return;
    viewNavigation.clearCanvasFocus();
    if (nextMode === "outline") viewNavigation.rememberOutlineViewport();
    if (nextMode === "map") {
      setViewportScale(INITIAL_VIEWPORT.scale);
      resolutionFilter.resetViewportScale(INITIAL_VIEWPORT.scale);
      returnToCanvas();
    }
    pendingViewModeFocusRef.current = nextMode;
    setViewMode(nextMode);
  }, [viewModeRef, viewNavigation, resolutionFilter, returnToCanvas]);
  function changeViewMode(nextMode: EditorViewMode) {
    if (!editorShortcutsEnabled) return;
    applyViewMode(nextMode);
  }
  useLayoutEffect(() => {
    const pending = pendingViewModeFocusRef.current;
    if (pending === null || pending !== viewMode) return;
    pendingViewModeFocusRef.current = null;
    if (pending === "map") {
      canvasContainerRef.current?.focus();
      return;
    }
    resolveOutlineInitialFocusTarget()?.focus();
  }, [viewMode]);
  // search.focus-in-map: パレット閉鎖前は根が inert のため、閉鎖後にフォーカスする
  useLayoutEffect(() => {
    if (!pendingMapSearchFocusRef.current) return;
    if (commandPalette.screen !== "closed") return;
    pendingMapSearchFocusRef.current = false;
    nodeSearchInputRef.current?.focus();
  }, [commandPalette.screen]);
  const openPalette = commandPalette.open;
  const openCommandPalette = useCallback(() => {
    if (!editorShortcutsEnabled) return;
    const active = document.activeElement;
    commandPaletteOpenerRef.current = active instanceof HTMLElement ? active : null;
    openPalette();
  }, [editorShortcutsEnabled, openPalette]);
  useCommandPaletteShortcut({
    enabled: editorShortcutsEnabled,
    onOpen: openCommandPalette,
  });
  const commandAvailabilityContext = useMemo(
    () =>
      buildCommandAvailabilityContext({
        viewMode,
        selectedNodeId,
        focusing: focusRootId !== null,
        isProtectedMode: storageMode === "protected",
        hasConflict: persistence.conflictState === "conflict",
        isExternallyDeleted: persistence.conflictState === "externallyDeleted",
        canUndo,
        canRedo,
        canFitAll: displayState.fitNodes.length > 0,
        canFitSelection: selectedFitNodes.length > 0,
        canFocusBranch: selectedBranchIds !== null,
        canExpandSubtree: canExpandSelectedBranch,
        canCollapseSubtree: canCollapseSelectedBranch,
        canDuplicate: selectedNode !== null,
        // アウトライン時は allNodeIds 基準（マップの visibleNodeIds と不一致になりうる）
        canDeleteNodeOnly:
          viewMode === "outline" ? outlineActions.structureCanDelete : nodeOnlyDeletion.canDelete,
        canInsertParent: nodeParentInsertion.canInsert,
        canMoveSiblingUp:
          viewMode === "outline" ? outlineActions.structureCanMoveUp : siblingReorder.canMoveUp,
        canMoveSiblingDown:
          viewMode === "outline" ? outlineActions.structureCanMoveDown : siblingReorder.canMoveDown,
        canIndent: viewMode === "outline" ? outlineActions.structureCanIndent : nodeIndent.canIndent,
        canOutdent:
          viewMode === "outline" ? outlineActions.structureCanOutdent : nodeIndent.canOutdent,
        canOpenLabelReplace: nodes.length > 0,
        canOpenBranchMove: selectedNode !== null,
        canOpenNodeSplit: nodeSplit.canOpen,
        nodeSplitDisabledReason: nodeSplit.disabledReason,
        canOpenNodeMerge: nodeMerge.canOpen,
        nodeMergeDisabledReason: nodeMerge.disabledReason,
        canRegisterPart: partsLibrary.canRegister,
        canInsertPart: partsLibrary.parts.length > 0,
        canDeletePart: partsLibrary.parts.length > 0,
        canFocusInMapSearch: viewMode === "map",
        canOpenCrossMapSearch: true,
        outlineDuplicateIds: outlineModel.duplicateIds,
        outlineInvalidStructure: outlineModel.invalidStructure,
        outlineSelectedVisible: selectedNodeId !== null && outlineModel.allNodeIds.has(selectedNodeId),
      }),
    [
      viewMode, selectedNodeId, focusRootId, storageMode, persistence.conflictState,
      canUndo, canRedo, displayState.fitNodes.length, selectedFitNodes.length, selectedBranchIds,
      canExpandSelectedBranch, canCollapseSelectedBranch, selectedNode, nodeOnlyDeletion.canDelete,
      nodeParentInsertion.canInsert, siblingReorder.canMoveUp, siblingReorder.canMoveDown,
      nodeIndent.canIndent, nodeIndent.canOutdent, outlineActions.structureCanDelete,
      outlineActions.structureCanMoveUp, outlineActions.structureCanMoveDown,
      outlineActions.structureCanIndent, outlineActions.structureCanOutdent, nodes.length,
      nodeSplit.canOpen, nodeSplit.disabledReason, nodeMerge.canOpen, nodeMerge.disabledReason,
      partsLibrary.canRegister, partsLibrary.parts.length,
      outlineModel.duplicateIds, outlineModel.invalidStructure, outlineModel.allNodeIds,
    ],
  );
  const filteredPalette = useMemo(
    () => filterCommandCatalog(commandPalette.query, commandAvailabilityContext),
    [commandPalette.query, commandAvailabilityContext],
  );
  const availabilityContextRef = useLatestRef(commandAvailabilityContext);
  const runImmediateCore = useCallback((id: CommandId) => {
    return runCommandPaletteImmediateCore(id, {
      applyViewMode,
      fitAll: () => {
        viewportHandleRef.current?.fitNodes(displayState.fitNodes, recordBeforeViewportChange);
      },
      fitSelection: () => {
        viewportHandleRef.current?.fitNodes(selectedFitNodes, recordBeforeViewportChange);
      },
      focusBranch: () => {
        if (selectedNodeId === null) return false;
        recordBeforeViewportChange();
        setFocusRootId(selectedNodeId);
        return true;
      },
      clearFocus: () => {
        recordBeforeViewportChange();
        setFocusRootId(null);
      },
      expandSubtree: () => {
        if (selectedNodeId === null) return false;
        branchCollapse.setSubtreeCollapsed(selectedNodeId, false);
        return true;
      },
      collapseSubtree: () => {
        if (selectedNodeId === null) return false;
        branchCollapse.setSubtreeCollapsed(selectedNodeId, true);
        return true;
      },
      undo,
      redo,
      duplicateBranch: () => {
        duplication.duplicateSelected();
      },
      deleteNodeOnly: () => {
        if (viewMode === "outline") outlineActions.deleteSelectedCore();
        else nodeOnlyDeletion.deleteSelected();
      },
      insertParent: () => {
        nodeParentInsertion.insertSelected();
      },
      moveSibling: (direction) => {
        if (viewMode === "outline") outlineActions.moveCore(direction);
        else if (direction === "up") moveSelectedSiblingUp();
        else moveSelectedSiblingDown();
      },
      changeIndent: (direction) => {
        if (viewMode === "outline") outlineActions.changeIndentCore(direction);
        else if (direction === "indent") indentSelected();
        else outdentSelected();
      },
      focusInMapSearch: () => {
        pendingMapSearchFocusRef.current = true;
      },
      addOutlineRoot: () => {
        outlineActions.addRootCore();
      },
      addOutlineChild: () => {
        outlineActions.addChildCore();
      },
      addOutlineSibling: () => {
        outlineActions.addSiblingCore();
      },
      beginOutlineEdit: () => {
        if (selectedNodeId === null) return false;
        outlineActions.beginEditCore(selectedNodeId);
        return true;
      },
    });
  }, [
    viewMode, selectedNodeId, displayState.fitNodes, selectedFitNodes, recordBeforeViewportChange,
    setFocusRootId, branchCollapse, undo, redo, duplication, outlineActions, nodeOnlyDeletion,
    nodeParentInsertion, moveSelectedSiblingUp, moveSelectedSiblingDown, indentSelected, outdentSelected,
    applyViewMode,
  ]);
  const openDialogCommand = useCallback((id: CommandId) => {
    openCommandPaletteDialog(id, {
      openLabelReplace: labelReplace.open,
      openBranchMove: branchMove.open,
      openNodeSplit: nodeSplit.open,
      openNodeMerge: nodeMerge.open,
      openCrossMapSearch: crossMapDialogs.openCrossMapSearch,
      openRegisterPart: () => {
        partsLibrary.refresh();
        setPartsDialogMode("register");
      },
      openInsertPart: () => {
        partsLibrary.refresh();
        setPartsDialogMode("insert");
      },
      openDeletePart: () => {
        partsLibrary.refresh();
        setPartsDialogMode("delete");
      },
    });
  }, [labelReplace, branchMove, nodeSplit, nodeMerge, crossMapDialogs, partsLibrary]);
  const handleExecutePaletteActive = useCallback(() => {
    const item = filteredPalette.items[commandPalette.activeIndex];
    if (!item) return;
    // 可否拒否の setReject は executeCommandPaletteActive に一本化（live context で再評価）
    executeCommandPaletteActive(item.definition.id, {
      closePalette: commandPalette.close,
      setReject: commandPalette.setReject,
      publishSuccessNotice: publishCommandPaletteNotice,
      getAvailabilityContext: () => availabilityContextRef.current,
      runImmediateCore,
      openDialogCommand,
    });
  }, [
    filteredPalette.items, commandPalette, publishCommandPaletteNotice,
    availabilityContextRef, runImmediateCore, openDialogCommand,
  ]);
  const commandPaletteFocusRequest = commandPalette.focusRequest;
  const consumeCommandPaletteFocusRequest = commandPalette.consumeFocusRequest;
  useLayoutEffect(() => {
    if (commandPaletteFocusRequest?.kind !== "restore-opener") return;
    const candidates: Array<HTMLElement | null> = [
      commandPaletteOpenerRef.current,
      commandPaletteButtonRef.current,
      viewMode === "map" ? canvasContainerRef.current : resolveOutlineInitialFocusTarget(),
    ];
    candidates.find((candidate) => isRestorableFocusTarget(candidate))?.focus();
    consumeCommandPaletteFocusRequest();
  }, [commandPaletteFocusRequest, consumeCommandPaletteFocusRequest, viewMode]);

  // 操作通知バーの並び（上から表示する順）。位置ごとに系統が決まっている
  const bookmarks = useMapViewBookmarks(
    storageSession.storage, mapId, mapCreatedAt,
    storageMode === "persistent" && storageSession.mapId === mapId,
  );
  const operationNotices = [
    bookmarks.notice,
    displayState.layoutFailed ? LAYOUT_FAILED_NOTICE : null,
    persistence.notice,
    scopedJsonNotice,
    imageExport.notice,
    outlineExport.notice,
    duplication.notice,
    clipboardNotice,
    nodeSearchNotice,
    navigationNotice,
    outlineImport.notice,
    treeEditNotice,
    commandPaletteNotice,
    persistence.conflictActionNotice,
  ];

  // 閉じる描画で根の inert が外れた後に当てる（L-155）。"input"・"preview" はダイアログが当てる
  useLayoutEffect(() => {
    if (outlineFocusRequest !== "header") return;
    outlineImportButtonRef.current?.focus();
    consumeOutlineFocusRequest();
  }, [outlineFocusRequest, consumeOutlineFocusRequest]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col" data-map-id={mapId} inert={!editorShortcutsEnabled}>
        <AppHeader
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          layoutDirectionControls={headerLayoutControls
            ? <MapHeaderLayoutControls {...headerLayoutControls} />
            : null}
          mapControls={mapControls}
          saveStatus={persistence.saveStatus}
          viewControls={<EditorViewModeControl mode={viewMode} onChange={changeViewMode} />}
          showCanvasHints={viewMode === "map"}
          searchControls={(
            <div className="flex flex-wrap items-center gap-2">
              {viewMode === "map" && (
                <NodeSearchBox
                  query={nodeSearch.query}
                  onQueryChange={nodeSearch.setQuery}
                  hasQuery={nodeSearch.hasQuery}
                  matches={nodeSearch.matches}
                  total={nodeSearch.total}
                  onSelectResult={navigateToNode}
                  inputRef={nodeSearchInputRef}
                />
              )}
              <button
                ref={crossMapSearchButtonRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={crossMapDialogs.crossMapSearchOpen}
                onClick={crossMapDialogs.openCrossMapSearch}
                className="shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                全マップ検索
              </button>
            </div>
          )}
          importanceControls={(
            <NodeImportanceSelector
              importance={importanceSummary.kind === "uniform" ? importanceSummary.importance : null}
              disabled={importanceSummary.kind === "none"}
              selectionCount={importanceSummary.kind === "none" ? 0 : importanceSummary.count}
              mixed={importanceSummary.kind === "mixed"}
              onChange={(importance) => {
                updateNodesImportance(importanceTargetIds, importance);
              }}
            />
          )}
          resolutionControls={viewMode === "map" && (
            <>
              <ResolutionFilterSelector
                mode={resolutionFilter.mode}
                level={resolutionFilter.level}
                onChange={resolutionFilter.setMode}
              />
              <DepthLimitControl maxDepth={maxDepth} onChange={setMaxDepth} />
              <HighlightModeControl mode={highlightMode} onChange={setHighlightMode} />
              <NodePinControls
                pins={nodePins.pins}
                nodes={nodes}
                canRegister={nodePins.canRegister}
                onRegister={() => {
                  nodePins.registerPin();
                }}
                onJump={(nodeId) => {
                  nodePins.jumpToPin(nodeId);
                }}
                onDelete={(nodeId) => {
                  nodePins.deletePin(nodeId);
                }}
              />
            </>
          )}
          operationControls={(
            <>
              {viewMode === "map" && (
                <WheelZoomSensitivityControl
                  value={uiPrefs.wheelZoomSensitivity}
                  onChange={setWheelZoomSensitivity}
                />
              )}
              <CommandPaletteControl
                expanded={commandPalette.screen === "open"}
                onOpen={openCommandPalette}
                buttonRef={commandPaletteButtonRef}
              />
              <MapHistoryControls
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
              />
              {viewMode === "map" && (
                <>
                  <BranchNavigationControls
                    breadcrumb={breadcrumb}
                    focusing={focusRootId !== null}
                    canFocus={selectedBranchIds !== null}
                    canExpand={canExpandSelectedBranch}
                    canCollapse={canCollapseSelectedBranch}
                    canFitAll={displayState.fitNodes.length > 0}
                    canFitSelection={selectedFitNodes.length > 0}
                    canGoBack={viewNavigation.canGoBack}
                    canGoForward={viewNavigation.canGoForward}
                    onTravel={(direction) => {
                      if (viewNavigation.travel(direction)) canvasContainerRef.current?.focus();
                    }}
                    onFitAll={() => viewportHandleRef.current?.fitNodes(displayState.fitNodes, recordBeforeViewportChange)}
                    onFitSelection={() => viewportHandleRef.current?.fitNodes(selectedFitNodes, recordBeforeViewportChange)}
                    onToggleFocus={() => {
                      const nextFocusId = focusRootId === null ? selectedNodeId : null;
                      if (nextFocusId === focusRootId) return;
                      recordBeforeViewportChange();
                      setFocusRootId(nextFocusId);
                    }}
                    onSetSubtreeCollapsed={(collapsed) => {
                      if (selectedNodeId !== null) branchCollapse.setSubtreeCollapsed(selectedNodeId, collapsed);
                    }}
                    onNavigate={(id) => {
                      if (navigateToNode(id) !== "missing") canvasContainerRef.current?.focus();
                    }}
                  />
                  <MapViewBookmarkControls
                    key={bookmarks.key ?? mapId}
                    unavailable={bookmarks.key === null}
                    disabled={!bookmarks.ready || !persistence.hydrated || !editorShortcutsEnabled}
                    bookmarks={bookmarks.bookmarks}
                    onSave={(name) => bookmarks.save(name, viewNavigation.captureView())}
                    onApply={(snapshot) => {
                      if (viewNavigation.applyView(snapshot, viewNavigation.recordNavigation)) {
                        canvasContainerRef.current?.focus();
                      }
                    }}
                    onDelete={bookmarks.remove}
                  />
                  <NodeCollapseControl
                    selectedNodeId={selectedNodeId}
                    canToggle={selectedNodeId !== null && branchCollapse.canToggle(selectedNodeId)}
                    collapsed={selectedNodeId !== null && branchCollapse.collapsedNodeIds.has(selectedNodeId)}
                    hiddenCount={selectedNodeId === null ? 0 : branchCollapse.hiddenCountById.get(selectedNodeId) ?? 0}
                    onToggle={branchCollapse.toggle}
                  />
                  <NodeDuplicateControl
                    disabled={selectedNode === null}
                    onDuplicate={duplication.duplicateSelected}
                  />
                  <BranchMoveControl
                    expanded={branchMove.screen !== "closed"}
                    disabled={selectedNode === null}
                    onOpen={branchMove.open}
                    buttonRef={branchMoveButtonRef}
                  />
                  <LabelReplaceControl
                    expanded={labelReplace.screen !== "closed"}
                    disabled={nodes.length === 0}
                    onOpen={labelReplace.open}
                    buttonRef={labelReplaceButtonRef}
                  />
                  <NodeSplitControl
                    expanded={nodeSplit.screen !== "closed"}
                    disabled={!nodeSplit.canOpen}
                    disabledReason={nodeSplit.disabledReason}
                    onOpen={nodeSplit.open}
                    buttonRef={nodeSplitButtonRef}
                  />
                  <NodeMergeControl
                    expanded={nodeMerge.screen !== "closed"}
                    disabled={!nodeMerge.canOpen}
                    disabledReason={nodeMerge.disabledReason}
                    onOpen={nodeMerge.open}
                    buttonRef={nodeMergeButtonRef}
                  />
                  <NodeSiblingOrderControl
                    canMoveUp={siblingReorder.canMoveUp}
                    canMoveDown={siblingReorder.canMoveDown}
                    onMoveUp={moveSelectedSiblingUp}
                    onMoveDown={moveSelectedSiblingDown}
                  />
                  <NodeIndentControl
                    canOutdent={nodeIndent.canOutdent}
                    canIndent={nodeIndent.canIndent}
                    onOutdent={outdentSelected}
                    onIndent={indentSelected}
                  />
                  <NodeParentInsertControl
                    canInsert={nodeParentInsertion.canInsert}
                    onInsert={nodeParentInsertion.insertSelected}
                  />
                  <NodeOnlyDeleteControl
                    canDelete={nodeOnlyDeletion.canDelete}
                    onDelete={nodeOnlyDeletion.deleteSelected}
                  />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {CLIPBOARD_OPERATION_HINT}
                  </span>
                </>
              )}
              <OutlineImportControl
                expanded={outlineImport.screen !== "closed"}
                onOpen={outlineImport.open}
                buttonRef={outlineImportButtonRef}
              />
              <ExportScopeControl
                scope={exportScope}
                onChange={setExportScope}
                selectionAvailable={selectionScopeAvailable}
              />
              <MapPersistenceControls
                onExport={handleExportJson}
                onImport={persistence.importJsonFile}
                exportButtonRef={exportButtonRef}
                jsonExportEnabled={exportFormatControls.json.enabled}
                jsonExportDisabledReason={exportFormatControls.json.disabledReason}
              />
              <MapImageExportControls
                onExportPng={imageExport.exportPng}
                onExportSvg={imageExport.exportSvg}
                isExportingPng={imageExport.isExportingPng}
                pngEnabled={exportFormatControls.png.enabled}
                svgEnabled={exportFormatControls.svg.enabled}
                pngDisabledReason={exportFormatControls.png.disabledReason}
                svgDisabledReason={exportFormatControls.svg.disabledReason}
              />
              <OutlineExportControls
                onExportMarkdown={outlineExport.exportMarkdown}
                onExportPlainText={outlineExport.exportPlainText}
                markdownEnabled={exportFormatControls.markdown.enabled}
                plainTextEnabled={exportFormatControls.bullets.enabled}
                markdownDisabledReason={exportFormatControls.markdown.disabledReason}
                plainTextDisabledReason={exportFormatControls.bullets.disabledReason}
              />
            </>
          )}
          operationNotices={hasOperationNotice(operationNotices)
            ? <MapOperationNoticeList notices={operationNotices} />
            : null}
        />
        <MapConflictNotice
          conflictState={persistence.conflictState}
          onSaveAsCopy={persistence.handleSaveAsCopy}
          onReloadExternal={persistence.handleReloadExternal}
          onExportJson={persistence.exportJson}
        />
        <AppWorkspace
          canvas={viewMode === "outline" ? (
            <OutlineEditor nodes={nodes} model={outlineModel} selectedNodeId={selectedNodeId}
              documentRevision={documentRevision} enabled={editorShortcutsEnabled} actions={outlineActions} />
          ) : (
            <div className="relative h-full min-h-0 w-full">
              {maxDepth !== null
                && nodes.length > 0
                && displayState.visibleNodeIds.size === 0 && (
                <div className="absolute left-3 top-3 z-10 max-w-lg">
                  <DepthLimitEmptyHint onResetToUnlimited={() => setMaxDepth(null)} />
                </div>
              )}
              <MapStage
                canvasContainerRef={canvasContainerRef}
                viewportHandleRef={viewportHandleRef}
                nodes={displayState.displayNodes}
                focusRequest={canvasFocus.request}
                highlightNodeIds={highlightNodeIds}
                pinnedNodeIds={nodePins.pinnedNodeIds}
                isCurrentFocusRequest={canvasFocus.isCurrentRequest}
                onFocusRequestApplied={viewNavigation.onFocusRequestApplied}
                onFocusRequestDiscarded={viewNavigation.onFocusRequestDiscarded}
                onBeforeCenterNode={(request) => {
                  if (request === null) recordBeforeViewportChange();
                }}
                visibleNodeIds={displayState.visibleNodeIds}
                onViewportScaleChange={setViewportScale}
                onViewportFrameChange={handleViewportFrameChange}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={selectedNodeIds}
                onDoubleClick={addNode}
                onAddChildNode={addChildNodeExpanding}
                onAddSiblingNode={addSiblingNode}
                onSelectNode={selectNode}
                onToggleNodeSelection={toggleNodeSelection}
                onSelectNodeRange={selectNodeRange}
                onSetSelectionFromMarquee={setSelectionFromMarquee}
                onClearSelection={clearSelection}
                pruneSelectionToVisible={pruneSelectionToVisible}
                onUpdateLabel={updateNodeLabel}
                onMoveNode={moveNode}
                onBeginNodeMove={beginMoveHistory}
                onConnectNodes={connectNodes}
                layoutMode={layoutMode}
                onReorderSibling={siblingReorder.reorder}
                onChangeNodeIndent={nodeIndent.change}
                onInsertParentNode={nodeParentInsertion.insert}
                labelEditRequest={nodeParentInsertion.labelEditRequest}
                onDeleteNode={deleteNode}
                onCopySubtree={copySubtree}
                onPasteSubtree={pasteSubtree}
                onClipboardNotice={publishClipboardNotice}
                onGenerateIllustration={generateIllustration}
                resetRevision={resetRevision}
                documentRevision={documentRevision}
                shortcutsEnabled={editorShortcutsEnabled}
                wheelZoomSensitivity={uiPrefs.wheelZoomSensitivity}
                layoutSnapPrefs={layoutSnapPrefs}
                dialogMouseClickedAtRef={dialogMouseClickedAtRef}
              />
              {viewportFrame !== null && (
                <Minimap
                  nodes={displayState.displayNodes}
                  visibleNodeIds={displayState.visibleNodeIds}
                  viewport={viewportFrame.viewport}
                  screenSize={viewportFrame.screen}
                  onPanToWorldPoint={handleMinimapPan}
                />
              )}
              <MapViewportZoomControls
                scale={viewportScale}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
              />
            </div>
          )}
          sidePanel={(
            <NodeDetailPanel
              selectedNode={selectedNode}
              // アウトライン表示では主選択だけ（キャンバスで残った複数選択の件数を見せない）
              selectionCount={importanceTargetIds.length}
              documentRevision={documentRevision}
              viewMode={viewMode}
              currentMapId={mapId}
              maps={mapMoveTargets}
              corpus={corpus}
              storageMode={storageMode}
              onPreviewNote={previewNodeNote}
              onBeginNoteEdit={beginMoveHistory}
              onAddTag={addNodeTag}
              onRemoveTag={removeNodeTag}
              onAddLink={addNodeLink}
              onRemoveLink={removeNodeLink}
              onAddSource={addNodeSource}
              onRemoveSource={removeNodeSource}
              onAddMapLink={handleAddMapLink}
              onRemoveMapLink={removeNodeMapLink}
              onNavigateToMapTarget={navigateToMapTarget}
              onSetNodeIcon={setNodeIcon}
              onSetNodeKind={setNodeKind}
              generation={generation}
              onGenerate={generateIllustration}
              onAttach={(nodeId, dataUrl) => {
                if (attachIllustration(nodeId, dataUrl)) dismissGeneration();
              }}
              onRemove={removeIllustration}
            />
          )}
        />
      </div>
      {branchMove.screen === "open" && (
        <BranchMoveDialog
          mapMoveTargets={mapMoveTargets}
          targetMapId={branchMove.targetMapId}
          currentMapId={mapId}
          sameMap={branchMove.sameMap}
          parentCandidates={branchMove.parentCandidates}
          nodes={nodes}
          allowRoot={branchMove.allowRoot}
          parentTarget={branchMove.parentTarget}
          canSubmit={branchMove.canSubmit}
          error={branchMove.error}
          focusRequest={branchMove.focusRequest}
          onFocusRequestApplied={branchMove.consumeFocusRequest}
          onTargetMapChange={branchMove.setTargetMapId}
          onParentTargetChange={branchMove.setParentTarget}
          onCancel={branchMove.close}
          onSubmit={branchMove.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {labelReplace.screen === "open" && (
        <LabelReplaceDialog
          query={labelReplace.query}
          replacement={labelReplace.replacement}
          scopeSelectedOnly={labelReplace.scopeSelectedOnly}
          scopeCount={labelReplace.scopeCount}
          previewRows={labelReplace.previewRows}
          hiddenReplaceCount={labelReplace.hiddenReplaceCount}
          previewLimit={labelReplace.previewLimit}
          statusText={labelReplace.statusText}
          submitLabel={labelReplace.submitLabel}
          error={labelReplace.error}
          canSubmit={labelReplace.canSubmit}
          focusRequest={labelReplace.focusRequest}
          onFocusRequestApplied={labelReplace.consumeFocusRequest}
          onQueryChange={labelReplace.setQuery}
          onReplacementChange={labelReplace.setReplacement}
          onScopeSelectedOnlyChange={labelReplace.setScopeSelectedOnly}
          onCancel={labelReplace.close}
          onSubmit={labelReplace.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {nodeSplit.screen === "open" && (
        <NodeSplitDialog
          targetLabel={nodeSplit.targetLabel}
          separatorPreset={nodeSplit.separatorPreset}
          customSeparator={nodeSplit.customSeparator}
          fragments={nodeSplit.fragments}
          statusText={nodeSplit.statusText}
          error={nodeSplit.error}
          canSubmit={nodeSplit.canSubmit}
          focusRequest={nodeSplit.focusRequest}
          onFocusRequestApplied={nodeSplit.consumeFocusRequest}
          onSeparatorPresetChange={nodeSplit.setSeparatorPreset}
          onCustomSeparatorChange={nodeSplit.setCustomSeparator}
          onCancel={nodeSplit.close}
          onSubmit={nodeSplit.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {nodeMerge.screen === "open" && (
        <NodeMergeDialog
          preview={nodeMerge.preview}
          separatorPreset={nodeMerge.separatorPreset}
          customSeparator={nodeMerge.customSeparator}
          statusText={nodeMerge.statusText}
          error={nodeMerge.error}
          canSubmit={nodeMerge.canSubmit}
          focusRequest={nodeMerge.focusRequest}
          onFocusRequestApplied={nodeMerge.consumeFocusRequest}
          onSeparatorPresetChange={nodeMerge.setSeparatorPreset}
          onCustomSeparatorChange={nodeMerge.setCustomSeparator}
          onCancel={nodeMerge.close}
          onSubmit={nodeMerge.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {partsDialogMode !== null && (
        <PartsLibraryDialog
          mode={partsDialogMode}
          parts={partsLibrary.parts}
          canInsertChild={partsLibrary.canInsertChild}
          onCancel={() => setPartsDialogMode(null)}
          onRegister={(name) => {
            if (partsLibrary.registerPartFromSelection(name).ok) {
              setPartsDialogMode(null);
            }
          }}
          onInsert={(partId, insertMode) => {
            if (partsLibrary.insertPart(partId, insertMode).ok) {
              setPartsDialogMode(null);
            }
          }}
          onDelete={(partId) => {
            if (partsLibrary.deletePart(partId).ok) {
              setPartsDialogMode(null);
            }
          }}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {/* data-map-id を付けず、根の inert の外に置く */}
      {commandPalette.screen === "open" && (
        <CommandPaletteDialog
          open
          query={commandPalette.query}
          items={filteredPalette.items}
          overflowCount={filteredPalette.overflowCount}
          activeIndex={commandPalette.activeIndex}
          rejectMessage={commandPalette.rejectMessage}
          rejectSequence={commandPalette.rejectSequence}
          onQueryChange={commandPalette.setQuery}
          onMoveHighlight={(action) => {
            commandPalette.moveHighlight(action, filteredPalette.items.length);
          }}
          onExecuteActive={handleExecutePaletteActive}
          onDismiss={() => commandPalette.close("dismiss")}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {outlineImport.screen !== "closed" && (
        <OutlineImportDialog
          screen={outlineImport.screen}
          text={outlineImport.text}
          textLength={outlineImport.textLength}
          inputError={outlineImport.inputError}
          outline={outlineImport.outline}
          preview={outlineImport.preview}
          parentCandidate={resolveOutlineParentCandidate(
            nodes,
            outlineImport.parentCandidateId,
            outlineImport.parentCandidateStale,
          )}
          target={outlineImport.target}
          dialogNotices={outlineImport.dialogNotices}
          focusRequest={outlineImport.focusRequest}
          onFocusRequestApplied={outlineImport.consumeFocusRequest}
          onTextChange={outlineImport.setText}
          onPreview={outlineImport.requestPreview}
          onCancel={outlineImport.close}
          onBack={outlineImport.back}
          onTargetChange={outlineImport.setTarget}
          onSubmit={outlineImport.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {crossMapDialogs.crossMapSearchOpen && (
        <CrossMapSearchDialog
          corpus={corpus}
          storageMode={storageMode}
          onSelectMatch={crossMapDialogs.selectCrossMapSearchMatch}
          onClose={crossMapDialogs.closeCrossMapSearch}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {crossMapDialogs.brokenLinksDialogOpen && (
        <BrokenMapLinksDialog
          corpus={corpus}
          onNavigateToSource={crossMapDialogs.navigateToBrokenLinkSource}
          onRemoveCurrentMapLink={removeNodeMapLink}
          onClose={crossMapDialogs.closeBrokenLinksDialog}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {persistence.isConfirmOpen && (
        <MapConflictConfirmDialog
          isOpen={persistence.isConfirmOpen}
          onConfirm={persistence.handleConfirmReload}
          onCancel={persistence.handleCancelConfirm}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
    </>
  );
}
