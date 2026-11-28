"use client";

import { collectTaskProgress } from "@/domain/nodes/nodeTaskProgress";
import { useNodeTaskAttributeEditing } from "@/hooks/useNodeTaskAttributeEditing";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { BrokenMapLinksDialog } from "@/components/layout/BrokenMapLinksDialog";
import { CrossMapSearchDialog } from "@/components/layout/CrossMapSearchDialog";
import { RelationPartnerPickerDialog } from "@/components/layout/RelationPartnerPickerDialog";
import { isNodeTargetOperationBlocked } from "@/domain/map/mapCanvasSelectionGuards";
import { resolveGroupLabelEditAvailability } from "@/domain/map/mapGroupAvailability";
import { resolveLayoutPinnedDetailPanel } from "@/domain/map/mapLayoutPinnedAvailability";
import { resolvePinnedNodeDragCallbacks } from "@/domain/map/resolvePinnedNodeDragCallbacks";
import { resolveRelationMeaningEditAvailability } from "@/domain/map/mapRelationAvailability";
import { EditorViewModeControl, type EditorViewMode } from "@/components/layout/EditorViewModeControl";
import { ExportScopeControl } from "@/components/layout/ExportScopeControl";
import { OutlineEditor } from "@/components/outline/OutlineEditor";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { MapLibraryMetaV1 } from "@/domain/mapLibrary/mapLibraryMeta";
import {
  canUseSelectionScope,
  resolveExportFormatControls,
} from "@/domain/exportScope/exportFormatAvailability";
import type { ExportScope } from "@/domain/exportScope/exportScope";
import { normalizeExportForestParents } from "@/domain/exportScope/normalizeExportForestParents";
import { resolveExchangeExportNodes } from "@/domain/exportScope/resolveExchangeExportNodes";
import { resolveExportNodes } from "@/domain/exportScope/resolveExportNodes";
import { resolveSelectionTargetIds } from "@/domain/exportScope/resolveSelectionTargetIds";
import { summarizeSelectionImportance } from "@/domain/nodes/selectionImportanceSummary";
import { buildOutlineRows } from "@/domain/outline/outlineRows";
import { remapClosedForNodeIdMap } from "@/domain/map/relationGroupLifecycle";
import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { mapDocumentOptionsFromState } from "@/domain/persistence/mapDocumentState";
import { remapClosedBranchLayouts } from "@/domain/map/branchLayoutLifecycle";
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
import { BranchExtractDialog } from "@/components/layout/BranchExtractDialog";
import { LabelReplaceControl } from "@/components/layout/LabelReplaceControl";
import { LabelReplaceDialog } from "@/components/layout/LabelReplaceDialog";
import { NodeMergeControl } from "@/components/layout/NodeMergeControl";
import { NodeMergeDialog } from "@/components/layout/NodeMergeDialog";
import { AiAssistDialog } from "@/components/layout/AiAssistDialog";
import { NodeSplitControl } from "@/components/layout/NodeSplitControl";
import { NodeSplitDialog } from "@/components/layout/NodeSplitDialog";
import {
  PartsLibraryDialog,
  type PartsLibraryDialogMode,
} from "@/components/layout/PartsLibraryDialog";
import { useBranchMoveDialog } from "@/hooks/useBranchMoveDialog";
import { useBranchExtractDialog } from "@/hooks/useBranchExtractDialog";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";
import { useLabelReplaceDialog } from "@/hooks/useLabelReplaceDialog";
import { useNodeMergeDialog } from "@/hooks/useNodeMergeDialog";
import { useAiAssistDialog } from "@/hooks/useAiAssistDialog";
import { useAiAssistFocusReturn } from "@/hooks/useAiAssistFocusReturn";
import { useNodeSplitDialog } from "@/hooks/useNodeSplitDialog";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { useNodes } from "@/hooks/useNodes";
import { useNodePins } from "@/hooks/useNodePins";
import { usePartsLibrary } from "@/hooks/usePartsLibrary";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppWorkspace } from "@/components/layout/AppWorkspace";
import { EditorDock } from "@/components/layout/EditorDock";
import { DockCustomizeDialog } from "@/components/layout/DockCustomizeDialog";
import { buildEditorDockSlots } from "@/components/map/buildEditorDockSlots";
import { useDockCustomizeSession } from "@/hooks/useDockCustomizeSession";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";
import { DepthLimitControl } from "@/components/layout/DepthLimitControl";
import { DepthLimitEmptyHint } from "@/components/layout/DepthLimitEmptyHint";
import { HighlightModeControl } from "@/components/layout/HighlightModeControl";
import { NodePinControls } from "@/components/layout/NodePinControls";
import { ResolutionFilterSelector } from "@/components/layout/ResolutionFilterSelector";
import { MapHeaderLayoutControls } from "@/components/layout/MapHeaderLayoutControls";
import { WheelZoomSensitivityControl } from "@/components/layout/WheelZoomSensitivityControl";
import { ExchangeExportControls } from "@/components/layout/ExchangeExportControls";
import { ExchangeImportControl } from "@/components/layout/ExchangeImportControl";
import { ExchangeImportDialog } from "@/components/layout/ExchangeImportDialog";
import { MapImageExportControls } from "@/components/layout/MapImageExportControls";
import { MapPrintControls } from "@/components/layout/MapPrintControls";
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
import { CommentsControl } from "@/components/layout/CommentsControl";
import { CollabControl } from "@/components/layout/CollabControl";
import { CollabPublishConfirmDialog } from "@/components/layout/CollabPublishConfirmDialog";
import { MapCommentsDialog, type MapCommentsDialogFilter } from "@/components/layout/MapCommentsDialog";
import { ShareControl } from "@/components/layout/ShareControl";
import { ShareDialog } from "@/components/layout/ShareDialog";
import { TourEditorControl } from "@/components/layout/TourEditorControl";
import { TourEditorDialog } from "@/components/layout/TourEditorDialog";
import { PresentationStartControl } from "@/components/layout/PresentationStartControl";
import { PresentationPlaybackBar } from "@/components/layout/PresentationPlaybackBar";
import { LearnModeControl } from "@/components/layout/LearnModeControl";
import { VoiceInputControl } from "@/components/layout/VoiceInputControl";
import { LearnResetProgressDialog } from "@/components/layout/LearnResetProgressDialog";
import { LearnReviewCardsPanel } from "@/components/layout/LearnReviewCardsPanel";
import { resolveMapEditorCrossFeatureLocks } from "@/domain/map/mapEditorCrossFeatureLocks";
import { resolveMapEditorModalsBlockEditing } from "@/domain/map/mapEditorModalBlocking";
import {
  resolveShareOpenBlocked,
  shareOpenBlockedMessage,
} from "@/domain/share/shareOpenGuards";
import { resolveCommentsEntry } from "@/domain/share/shareCommentsOpenGuards";
import { collabAwarenessProfileFromShareSession } from "@/domain/collab/collabAwarenessProfile";
import type { ShareSession } from "@/domain/share/shareSession";
import {
  isCollabTabConflictGuardEnabled,
} from "@/domain/collab/collabSessionUi";
import { applyCollabOutlineExportBlock } from "@/domain/collab/applyCollabExportFormatBlock";
import {
  resolveCollabEntryBlocked,
  resolveCollabInputBlocked,
} from "@/domain/collab/collabGuards";
import { resolveCollabAwarenessSelection } from "@/domain/collab/resolveCollabAwarenessSelection";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { nodeMapStateFromDocument } from "@/domain/persistence/mapDocumentState";
import { useMapEditorLearn } from "@/hooks/useMapEditorLearn";
import { useMapEditorComments } from "@/hooks/useMapEditorComments";
import { useMapEditorCommentsDialog } from "@/hooks/useMapEditorCommentsDialog";
import { useMapEditorCollab } from "@/hooks/useMapEditorCollab";
import { useMapEditorShare } from "@/hooks/useMapEditorShare";
import { useMapEditorVoice } from "@/hooks/useMapEditorVoice";
import { useNarrowViewport } from "@/hooks/useNarrowViewport";
import {
  MAP_VOICE_MESSAGES,
  resolveVoiceExclusiveStopRequested,
} from "@/domain/map/mapVoiceGuards";
import { useLearnRevealKeyboard } from "@/hooks/useLearnRevealKeyboard";
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
import { PresenceLayer } from "@/components/map/PresenceLayer";
import { Minimap } from "@/components/map/Minimap";
import { MapViewportZoomControls, ZOOM_FACTOR } from "@/components/map/MapViewportZoomControls";
import {
  clampViewportScale,
  INITIAL_VIEWPORT,
  zoomViewportAt,
} from "@/components/map/mapViewport";
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
import { useMapPrintExport } from "@/hooks/useMapPrintExport";
import { useMapJsonExport } from "@/hooks/useMapJsonExport";
import { useExchangeExport } from "@/hooks/useExchangeExport";
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
import { useExchangeImport } from "@/hooks/useExchangeImport";
import { useMapEditorTourAndPresentation } from "@/hooks/useMapEditorTourAndPresentation";
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
  libraryMeta: MapLibraryMetaV1;
  onMoveBranchToMap: (rootId: number, targetMapId: string) => MapLibraryOperationResult;
  onExtractBranchToNewMap: (rootId: number) => MapLibraryOperationResult;
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
  /** L-060: 共有セッション（null＝未ログイン。loading 中も null になりうる） */
  shareSession: ShareSession;
  /** loading と未ログインを混同しない（useShareSession.status） */
  shareSessionStatus: "loading" | "ready";
  shareDialogOpen: boolean;
  onShareDialogOpenChange: (open: boolean) => void;
  /**
   * 共有入口。未ログインでもダイアログを開く（ログイン導線は ShareDialog 内）。
   * 成功扱いにせず createShare は呼ばない（設計 §10.1 / L-001）
   */
  onShareRequest: () => void;
  onShareLogin: () => void;
  /**
   * `/collab/[token]` 参加モード。指定時は自動 join（所有者の開始 UI は出るが start は拒否されうる）。
   * 省略時は所有者シェル（idle から開始）。
   */
  collabJoinToken?: string | null;
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
  libraryMeta,
  onMoveBranchToMap,
  onExtractBranchToNewMap,
  onSaveCurrentAsNewMap,
  shortcutsEnabled,
  dialogMouseClickedAtRef,
  pendingNavigation,
  onConsumePendingNavigation,
  onSwitchToMapTarget,
  brokenLinksDialogRequest,
  onBrokenLinksDialogClosed,
  shareSession,
  shareSessionStatus,
  shareDialogOpen,
  onShareDialogOpenChange,
  onShareRequest,
  onShareLogin,
  collabJoinToken = null,
}: MapEditorProps) {
  const {
    nodes,
    selectedNodeId,
    selectedNodeIds,
    canvasSelection,
    layoutMode,
    treeDirection,
    layoutSpacing,
    layoutStyle,
    branchLayouts,
    relations,
    groups,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    selectRelation,
    selectGroup,
    restoreSelection,
    toggleNodeSelection,
    selectNodeRange,
    setSelectionFromMarquee,
    clearSelection,
    clearNonNodeSelection,
    pruneSelectionToVisible,
    addRelation,
    removeRelation,
    updateRelation,
    addGroup,
    removeGroup,
    updateGroupLabel,
    updateNodeLabel,
    updateNodesImportance,
    applyAiProposals,
    applyAiStructureProposals,
    moveNode,
    movePinnedNode,
    finalizePinnedNodeMove,
    setNodeLayoutPinned,
    setBranchLayout,
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
    setLayoutStyle,
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
    applyTask,
    applyCustomAttribute,
    setNodeKind,
    beginMoveHistory,
    documentRevision,
    canUndo,
    canRedo,
    undo,
    redo,
    tour,
    createTour,
    removeTour,
    setTourTitle,
    addTourStep,
    removeTourStep,
    reorderTourStep,
    overwriteTourStepSnapshot,
    setTourStepCaption,
    learn,
    revealLearnNode,
    resetLearnProgress,
    generateLearnReviewCards,
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
  const { prefs: uiPrefs, setWheelZoomSensitivity, setDockLayout } = useUiPrefs();
  const dockCustomize = useDockCustomizeSession({
    visibleSlotIds: uiPrefs.dockLayout.visibleSlotIds,
    setDockLayout,
  });
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedRelation = useMemo(() => {
    if (canvasSelection.type !== "relation") return null;
    return (relations ?? []).find((relation) => relation.id === canvasSelection.id) ?? null;
  }, [canvasSelection, relations]);
  const selectedGroup = useMemo(() => {
    if (canvasSelection.type !== "group") return null;
    return (groups ?? []).find((group) => group.id === canvasSelection.id) ?? null;
  }, [canvasSelection, groups]);
  // 一括編集の対象。アウトラインは単一選択のため、キャンバスで残った複数選択を見えないまま変えない
  const importanceTargetIds = useMemo<readonly number[]>(() => {
    if (viewMode === "map") return selectedNodeIds;
    return selectedNodeId === null ? [] : [selectedNodeId];
  }, [viewMode, selectedNodeIds, selectedNodeId]);
  const taskProgress = useMemo(() => collectTaskProgress(nodes), [nodes]);
  const importanceSummary = summarizeSelectionImportance(nodes, importanceTargetIds);
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
    layoutStyle,
    branchLayouts,
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

  const [collabPublishConfirmOpen, setCollabPublishConfirmOpen] = useState(false);
  /** マップ切替拒否を早期コールバックでも見る（collab 配線前の navigate 用） */
  const collabMapSwitchBlockedRef = useRef<string | null>(null);
  /**
   * persistence より後段の collab 導出を、autosave／競合監視がイベント時に読む（render 中 setState ミラー禁止）。
   */
  const collabSavePolicyRef = useRef({ localSaveEnabled: true, conflictGuardEnabled: true });
  const getCollabLocalSaveEnabled = useCallback(
    () => collabSavePolicyRef.current.localSaveEnabled,
    [],
  );
  const getCollabConflictGuardEnabled = useCallback(
    () => collabSavePolicyRef.current.conflictGuardEnabled,
    [],
  );
  /** share 配線前でも start 時に読めるよう後段で更新 */
  const sharedMapIdRef = useRef<string | null>(null);

  const persistence = useMapPersistence({
    nodes,
    layoutMode,
    treeDirection,
    layoutSpacing,
    layoutStyle,
    branchLayouts,
    relations,
    groups,
    tour,
    replaceMap: replaceMapAndReset,
    storageSession,
    storageMode,
    mapName,
    onSaveCurrentAsNewMap,
    getConflictMonitorEnabled: getCollabConflictGuardEnabled,
    getLocalSaveEnabled: getCollabLocalSaveEnabled,
  });
  const relationEditDisabled = !resolveRelationMeaningEditAvailability({
    viewMode,
    isProtectedMode: storageMode === "protected",
    hasConflict: persistence.conflictState === "conflict",
    isExternallyDeleted: persistence.conflictState === "externallyDeleted",
    nodes,
    relation: selectedRelation ?? undefined,
  }).enabled;
  const groupEditDisabled = !resolveGroupLabelEditAvailability({
    viewMode,
    isProtectedMode: storageMode === "protected",
    hasConflict: persistence.conflictState === "conflict",
    isExternallyDeleted: persistence.conflictState === "externallyDeleted",
    nodes,
    group: selectedGroup ?? undefined,
  }).enabled;
  const layoutPinnedPanel = resolveLayoutPinnedDetailPanel({
    viewMode,
    isProtectedMode: storageMode === "protected",
    hasConflict: persistence.conflictState === "conflict",
    isExternallyDeleted: persistence.conflictState === "externallyDeleted",
    selectedNodeId,
    selectedNodeIds,
    nodes,
    canvasSelection,
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
  const exportFormatControls = useMemo(
    () => resolveExportFormatControls(exportScope, exportNodes.length),
    [exportScope, exportNodes.length],
  );
  const print = useMapPrintExport({
    nodes: exportNodes,
    mapName,
    ...exportFormatControls.print,
  });
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const scopedJsonSnapshot = useMemo(() => {
    const exportIdMap = new Map(exportDocumentNodes.map((node) => [node.id, node.id]));
    const closed = remapClosedForNodeIdMap(relations, groups, exportIdMap);
    const closedBranchLayouts = remapClosedBranchLayouts(branchLayouts, exportIdMap);
    return serializeMapDocument(createMapDocument(exportDocumentNodes, layoutMode, {
      ...mapDocumentOptionsFromState({ treeDirection, layoutSpacing, layoutStyle }),
      relations: closed.relations,
      groups: closed.groups,
      branchLayouts: closedBranchLayouts,
    }));
  }, [
    exportDocumentNodes,
    layoutMode,
    treeDirection,
    layoutSpacing,
    layoutStyle,
    branchLayouts,
    relations,
    groups,
  ]);
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
  const [relationPartnerFromId, setRelationPartnerFromId] = useState<number | null>(null);
  const nodeOpsBlockedByCanvasSelection = isNodeTargetOperationBlocked(canvasSelection);
  const pinnedNodeDragCallbacks = resolvePinnedNodeDragCallbacks({
    viewMode,
    isProtectedMode: storageMode === "protected",
    hasConflict: persistence.conflictState === "conflict",
    isExternallyDeleted: persistence.conflictState === "externallyDeleted",
    canvasSelection,
    layoutMode,
    nodes,
    movePinnedNode,
    finalizePinnedNodeMove,
  });
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
    libraryMeta,
  });
  const guardedOnSwitchToMapTarget = useCallback((targetMapId: string, targetNodeId?: number) => {
    if (collabMapSwitchBlockedRef.current !== null) return;
    onSwitchToMapTarget(targetMapId, targetNodeId);
  }, [onSwitchToMapTarget]);
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
    onSwitchToMapTarget: guardedOnSwitchToMapTarget,
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
  const exchangeImport = useExchangeImport({
    selectedNodeId,
    documentRevision,
    insertForest,
    expandNodes: branchCollapse.expandNodes,
  });
  const isProtectedMode = storageMode === "protected";
  const hasMapConflict = persistence.conflictState === "conflict";
  const isMapExternallyDeleted = persistence.conflictState === "externallyDeleted";
  // useMapEditorLearn / Tour が useMapEditorVoice より先に走るため、排他は listening のミラー state で渡す
  const [voiceListening, setVoiceListening] = useState(false);
  const {
    tourEditor,
    presentationPlayback,
    tourEditorButtonRef,
    presentationStartButtonRef,
    playingPresentation,
    tourHeaderDisabled,
    previewTourStep,
    presentationStartDisabled: presentationStartDisabledFromTour,
  } = useMapEditorTourAndPresentation({
    tour,
    storageMode,
    conflictState: persistence.conflictState,
    voiceListening,
    captureView: viewNavigation.captureView,
    applyView: viewNavigation.applyView,
    createTour,
    removeTour,
    setTourTitle,
    addTourStep,
    removeTourStep,
    reorderTourStep,
    overwriteTourStepSnapshot,
    setTourStepCaption,
  });
  const {
    learnMode,
    learningActive,
    learnModeButtonRef,
    learnNotice,
    learnDisplay,
    learnStartBlockedReason,
    learnResetBlockedReason,
    learnGenerateBlockedReason,
    reviewCards,
    handleToggleLearnMode,
    handleConfirmLearnReset,
    handleSelectNodeWithLearn,
    handleGenerateLearnReviewCards,
    handleOpenLearnReviewCards,
    attemptRevealLearnNode,
    publishPresentationBlockedDuringLearn,
    startLearnFromPalette,
    endLearnFromPalette,
  } = useMapEditorLearn({
    learn,
    documentRevision,
    playingPresentation,
    storageMode,
    conflictState: persistence.conflictState,
    selectedNodeId,
    selectedNodeIds,
    revealLearnNode,
    resetLearnProgress,
    generateLearnReviewCards,
    selectNode,
    voiceListening,
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
  const branchExtract = useBranchExtractDialog({
    nodes,
    selectedNodeId,
    documentRevision,
    onExtractBranchToNewMap,
  });
  const branchExtractFocusFallbacks = useMemo(() => [] as const satisfies readonly RefObject<HTMLButtonElement | null>[], []);
  useHeaderFocusReturn({
    focusRequest: branchExtract.focusRequest,
    consumeFocusRequest: branchExtract.consumeFocusRequest,
    buttonRef: exportButtonRef,
    fallbackRefs: branchExtractFocusFallbacks,
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
  // 共同編集を AI／voice／share より先に配線し、導出フラグをそのまま下位へ渡す（render 中 setState ミラー禁止）。
  const getCollabDocumentJson = useCallback(
    () => persistence.currentSnapshot,
    [persistence.currentSnapshot],
  );
  const getCollabSharedMapId = useCallback(() => sharedMapIdRef.current, []);
  const getCollabStartGuard = useCallback(
    () => ({
      isProtectedMode,
      learningActive,
      playingPresentation,
      voiceListening,
      hasMapConflict,
      isMapExternallyDeleted,
    }),
    [
      hasMapConflict,
      isMapExternallyDeleted,
      isProtectedMode,
      learningActive,
      playingPresentation,
      voiceListening,
    ],
  );
  const handleCollabApplyEnded = useCallback((documentJson: string) => {
    if (documentJson.length === 0) return;
    const parsed = parseMapDocumentJson(documentJson);
    if (!parsed.ok) return;
    replaceMapAndReset(nodeMapStateFromDocument(parsed.value));
    persistence.rebaseSnapshot(documentJson);
  }, [persistence, replaceMapAndReset]);
  /**
   * Yjs → useNodes 投影由来の revision では push しない（Undo 自操作のみ契約）。
   * 投影後の currentSnapshot を lastProjected に残し一致 skip（boolean 1回消費ではない）。
   * Strict 二重 effect／deps 再走でも、スナップショットが投影のままなら push しない。
   */
  const captureProjectedSnapshotRef = useRef(false);
  const lastProjectedSnapshotRef = useRef<string | null>(null);
  const handleYjsDocument = useCallback((document: import("@/types/mapDocument").MapDocumentV3) => {
    captureProjectedSnapshotRef.current = true;
    replaceMapAndReset(nodeMapStateFromDocument(document));
  }, [replaceMapAndReset]);
  useLayoutEffect(() => {
    if (!captureProjectedSnapshotRef.current) return;
    captureProjectedSnapshotRef.current = false;
    lastProjectedSnapshotRef.current = persistence.currentSnapshot;
  }, [persistence.currentSnapshot, documentRevision]);
  /** awareness 表示名は Google name（email フォールバックなし・設計 必達 100） */
  const getCollabAwarenessProfile = useCallback(
    () => collabAwarenessProfileFromShareSession(shareSession),
    [shareSession],
  );
  const getCollabAwarenessSelection = useCallback(() => {
    // viewport 未準備なら null（{0,0} 捏造禁止・L-002）
    return resolveCollabAwarenessSelection({
      selectedNodeIds,
      screen: viewportFrame?.screen ?? null,
      viewport: viewportFrame?.viewport ?? null,
    });
  }, [selectedNodeIds, viewportFrame]);
  const awarenessRevision = [
    selectedNodeIds.join(","),
    viewportFrame?.viewport.offsetX ?? 0,
    viewportFrame?.viewport.offsetY ?? 0,
    viewportFrame?.viewport.scale ?? 0,
    viewportFrame?.screen.width ?? 0,
    viewportFrame?.screen.height ?? 0,
  ].join(":");
  const collab = useMapEditorCollab({
    mapId,
    shareSession,
    getDocumentJson: getCollabDocumentJson,
    getSharedMapId: getCollabSharedMapId,
    getStartGuard: getCollabStartGuard,
    onApplyEndedDocument: handleCollabApplyEnded,
    onAskPublishAfterEnd: () => {
      setCollabPublishConfirmOpen(true);
    },
    onYjsDocument: handleYjsDocument,
    getAwarenessProfile: getCollabAwarenessProfile,
    getAwarenessSelection: getCollabAwarenessSelection,
    awarenessRevision,
    joinToken: collabJoinToken,
  });
  const collabSaveBlocked = resolveCollabEntryBlocked("save", collab.collabSession);
  const collabProtectBlocked = resolveCollabEntryBlocked("protect", collab.collabSession);
  const collabMapSwitchBlocked = resolveCollabEntryBlocked("mapSwitch", collab.collabSession);
  const collabOutlineExportBlocked = resolveCollabEntryBlocked("outlineExport", collab.collabSession);
  const collabJsonImportBlocked = resolveCollabEntryBlocked("jsonImport", collab.collabSession);
  const collabAiAssistBlocked = resolveCollabEntryBlocked("aiAssist", collab.collabSession);
  const collabBulkBlocked = resolveCollabEntryBlocked("bulkEdit", collab.collabSession);
  // persistence がイベント／effect 時に読む導出値（layoutEffect で同期 → 同コミットの passive effect 前に反映）
  const collabLocalSaveEnabled = collabSaveBlocked === null;
  const collabConflictGuardEnabled = isCollabTabConflictGuardEnabled(collab.collabSession);
  useLayoutEffect(() => {
    collabSavePolicyRef.current = {
      localSaveEnabled: collabLocalSaveEnabled,
      conflictGuardEnabled: collabConflictGuardEnabled,
    };
  }, [collabConflictGuardEnabled, collabLocalSaveEnabled]);
  useLayoutEffect(() => {
    collabMapSwitchBlockedRef.current = collabMapSwitchBlocked;
  }, [collabMapSwitchBlocked]);
  // active 中: ローカル編集 → Yjs 正本（投影スナップショットと一致する間は push しない）
  useEffect(() => {
    if (collab.collabSession.status !== "active") return;
    if (persistence.currentSnapshot === lastProjectedSnapshotRef.current) return;
    collab.pushLocalDocumentJson(persistence.currentSnapshot);
    // pushLocalDocumentJson / collab 本体は安定したコールバック。revision と snapshot のみ追跡
    // eslint-disable-next-line react-hooks/exhaustive-deps -- active 中の文書 revision 同期
  }, [collab.collabSession.status, documentRevision, persistence.currentSnapshot]);
  const collabInputBlocked = resolveCollabInputBlocked(collab.collabSession);
  const collabLearnBlocked = resolveCollabEntryBlocked("learn", collab.collabSession);
  const collabPresentationBlocked = resolveCollabEntryBlocked("presentation", collab.collabSession);
  const collabVoiceBlocked = resolveCollabEntryBlocked("voice", collab.collabSession);
  const collabCommentsBlocked = resolveCollabEntryBlocked("comments", collab.collabSession);
  const collabOutlineImportBlocked = resolveCollabEntryBlocked("outlineImport", collab.collabSession);
  const collabShareDialogBlocked = resolveCollabEntryBlocked("shareDialogOpen", collab.collabSession);

  // AI 支援（Phase 32）。入口の可否は右パネルとコマンドパレットで同じ値を使う（L-057・L-061）。
  // blockers はフック内の useMemo を効かせるため、値が変わったときだけ作り直す。
  const taskNodeId = selectedNode && importanceTargetIds.length === 1
    && (viewMode === "outline" || (!selectedRelation && !selectedGroup)) ? selectedNode.id : null;
  const aiAssistBlockers = useMemo(() => ({
    isProtectedMode,
    hasConflict: hasMapConflict,
    isExternallyDeleted: isMapExternallyDeleted,
    playingPresentation,
    learningActive,
    voiceListening,
    collabBlockedReason: collabAiAssistBlocked,
  }), [
    isProtectedMode,
    hasMapConflict,
    isMapExternallyDeleted,
    learningActive,
    playingPresentation,
    voiceListening,
    collabAiAssistBlocked,
  ]);
  const aiAssist = useAiAssistDialog({
    mapId,
    documentRevision,
    nodes,
    selectedNodeIds: importanceTargetIds,
    visibleNodeIds: displayState.visibleNodeIds,
    layoutMode,
    treeDirection,
    layoutSpacing,
    layoutStyle,
    branchLayouts,
    blockers: aiAssistBlockers,
    applyAiProposals,
    applyAiStructureProposals,
    publishNotice: publishTreeEditNotice,
  });
  const {
    open: openAiAssist,
    summaryEntry: aiSummaryEntry,
    importanceEntry: aiImportanceEntry,
    childEntry: aiChildEntry,
    classifyEntry: aiClassifyEntry,
    duplicatesEntry: aiDuplicatesEntry,
    perspectivesEntry: aiPerspectivesEntry,
  } = aiAssist;
  const {
    summaryButtonRef: aiSummaryButtonRef,
    importanceButtonRef: aiImportanceButtonRef,
    childCandidatesButtonRef: aiChildCandidatesButtonRef,
    classifyReorderButtonRef: aiClassifyReorderButtonRef,
    duplicatesButtonRef: aiDuplicatesButtonRef,
    missingPerspectivesButtonRef: aiMissingPerspectivesButtonRef,
  } = useAiAssistFocusReturn({
    focusRequest: aiAssist.focusRequest,
    consumeFocusRequest: aiAssist.consumeFocusRequest,
    viewMode,
    canvasRef: canvasContainerRef,
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
  const {
    focusRequest: exchangeFocusRequest,
    consumeFocusRequest: consumeExchangeFocusRequest,
    lastEntry: exchangeLastEntry,
  } = exchangeImport;
  const exchangeOpmlButtonRef = useRef<HTMLButtonElement>(null);
  const exchangeCsvButtonRef = useRef<HTMLButtonElement>(null);
  const commandPalette = useCommandPalette({ mapId, documentRevision });
  const commandPaletteButtonRef = useRef<HTMLButtonElement>(null);
  const commandPaletteOpenerRef = useRef<HTMLElement | null>(null);
  const nodeSearchInputRef = useRef<HTMLInputElement>(null);
  const {
    notice: commandPaletteNotice,
    publishNotice: publishCommandPaletteNotice,
  } = useRevisionScopedNotice(documentRevision);
  const viewModeRef = useLatestRef(viewMode);
  const commentsDialog = useMapEditorCommentsDialog({ mapId, fallbackFocusRef: exportButtonRef });
  const editorModalsBlockEditing = resolveMapEditorModalsBlockEditing({
    commandPaletteOpen: commandPalette.screen !== "closed",
    printSettingsOpen,
    outlineImportOpen: outlineImport.screen !== "closed",
    exchangeImportOpen: exchangeImport.screen !== "closed",
    tourEditorOpen: tourEditor.screen !== "closed",
    presentationPlaybackOpen: presentationPlayback.screen !== "closed",
    branchMoveOpen: branchMove.screen !== "closed",
    branchExtractOpen: branchExtract.screen !== "closed",
    labelReplaceOpen: labelReplace.screen !== "closed",
    nodeSplitOpen: nodeSplit.screen !== "closed",
    nodeMergeOpen: nodeMerge.screen !== "closed",
    aiAssistOpen: aiAssist.screen !== "closed",
    partsDialogOpen: partsDialogMode !== null,
    crossMapSearchOpen: crossMapDialogs.crossMapSearchOpen,
    brokenLinksDialogOpen: crossMapDialogs.brokenLinksDialogOpen,
    persistenceConfirmOpen: persistence.isConfirmOpen,
    shareDialogOpen,
    commentsDialogOpen: commentsDialog.open,
  });
  const voiceExclusiveStopRequested = resolveVoiceExclusiveStopRequested({
    modalBlockingVoiceStart: editorModalsBlockEditing,
    learningActive,
    playingPresentation,
  });
  const voiceStartGuard = useMemo(() => ({
    isProtectedMode,
    hasConflict: hasMapConflict,
    isExternallyDeleted: isMapExternallyDeleted,
    learningActive,
    playingPresentation,
    modalBlockingVoiceStart: editorModalsBlockEditing,
    canvasSelection,
    relationPartnerOpen: relationPartnerFromId !== null,
  }), [
    canvasSelection,
    hasMapConflict,
    isMapExternallyDeleted,
    isProtectedMode,
    learningActive,
    editorModalsBlockEditing,
    playingPresentation,
    relationPartnerFromId,
  ]);
  const voiceInputButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const {
    listening,
    interimTranscript,
    voiceNotice,
    voiceStartDisabledReason,
    canVoiceInputStart,
    canVoiceInputStop,
    handleVoiceToggle,
    startVoiceFromPalette,
    stopVoiceFromPalette,
  } = useMapEditorVoice({
    mapId,
    documentRevision,
    insertForest,
    selectNode,
    selectedNodeId,
    selectedNodeIds,
    startGuard: voiceStartGuard,
    exclusiveStopRequested: voiceExclusiveStopRequested,
    onListeningChange: setVoiceListening,
    onInsertSuccessInMap: (rootId) => {
      if (viewModeRef.current === "map") canvasFocus.issueRequest(rootId);
    },
  });
  const getShareDocumentJson = useCallback(
    () => persistence.currentSnapshot,
    [persistence.currentSnapshot],
  );
  const share = useMapEditorShare({
    mapId,
    mapTitle: mapName,
    shareSession,
    documentRevision,
    shareDialogOpen,
    getDocumentJson: getShareDocumentJson,
  });
  const sharedMapId = share.localMeta.status === "present" ? share.localMeta.value.sharedMapId : null;
  useLayoutEffect(() => {
    sharedMapIdRef.current = sharedMapId;
  }, [sharedMapId]);
  const effectiveExportFormatControls = useMemo(
    () => applyCollabOutlineExportBlock(exportFormatControls, collabOutlineExportBlocked),
    [collabOutlineExportBlocked, exportFormatControls],
  );
  const effectiveMapControls = useMemo(() => {
    const libraryBlocked = collabMapSwitchBlocked !== null || collabProtectBlocked !== null;
    if (!libraryBlocked || !isValidElement(mapControls)) return mapControls;
    return cloneElement(mapControls as ReactElement<{ disabled?: boolean }>, { disabled: true });
  }, [collabMapSwitchBlocked, collabProtectBlocked, mapControls]);
  const shareOpenBlockedReasonCode = resolveShareOpenBlocked({
    hasMapConflict,
    isMapExternallyDeleted,
    learningActive,
    playingPresentation,
  });
  const shareOpenBlockedReason =
    shareOpenBlockedReasonCode === null
      ? collabShareDialogBlocked
      : shareOpenBlockedMessage(shareOpenBlockedReasonCode);
  const handleShareControlOpen = useCallback(() => {
    if (shareOpenBlockedReason !== null) return;
    // 未ログインでもダイアログを開く。open→modal 束で listening を即停止（inventory §0）
    onShareRequest();
  }, [onShareRequest, shareOpenBlockedReason]);
  const shareWasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (shareWasOpenRef.current && !shareDialogOpen) {
      const button = shareButtonRef.current;
      (button?.disabled ? exportButtonRef.current : button)?.focus();
    }
    shareWasOpenRef.current = shareDialogOpen;
  }, [exportButtonRef, shareDialogOpen]);
  const handleShareDialogClose = useCallback(() => {
    collab.clearNotice();
    onShareDialogOpenChange(false);
  }, [collab, onShareDialogOpenChange]);
  const handleCollabPublishDismiss = useCallback(() => {
    collab.clearNotice();
    setCollabPublishConfirmOpen(false);
  }, [collab]);
  const handleCollabPublishConfirm = useCallback(() => {
    collab.clearNotice();
    setCollabPublishConfirmOpen(false);
    // 自動 publish しない。確認後に共有ダイアログの更新へ誘導
    onShareDialogOpenChange(true);
  }, [collab, onShareDialogOpenChange]);
  const commentNodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const commentNodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.label] as const)),
    [nodes],
  );
  const comments = useMapEditorComments({
    mapId,
    sharedMapId,
    shareSession,
    shareSessionStatus,
    dialogOpen: commentsDialog.open,
    nodeIds: commentNodeIds,
  });
  // 未ログインでも未共有なら未共有の理由（設計 §7.2）
  const {
    blockedReason: commentsBlockedReason,
    controlDisabledReason: commentsControlDisabledReasonBase,
  } = resolveCommentsEntry({ shared: sharedMapId !== null, learningActive, playingPresentation });
  const commentsControlDisabledReason = commentsControlDisabledReasonBase ?? collabCommentsBlocked;
  // ヘッダーと右パネルの入口を 1 本にする（ガードも同じ。open→modal 束で listening を即停止）
  const { show: showCommentsDialog } = commentsDialog;
  const openComments = useCallback((initialFilter: MapCommentsDialogFilter) => {
    if (commentsControlDisabledReason !== null) return;
    showCommentsDialog(initialFilter);
  }, [commentsControlDisabledReason, showCommentsDialog]);
  const openNodeComments = useCallback(() => openComments("selected"), [openComments]);
  const crossFeatureLocks = useMemo(
    () => resolveMapEditorCrossFeatureLocks({
      learningActive,
      playingPresentation,
      isProtectedMode,
      hasConflict: hasMapConflict,
      isExternallyDeleted: isMapExternallyDeleted,
      voiceListening: listening,
    }),
    [hasMapConflict, isMapExternallyDeleted, isProtectedMode, learningActive, listening, playingPresentation],
  );
  const { headerLayoutControls, layoutSnapPrefs } = useMapHeaderLayoutControls({
    viewMode,
    isProtectedMode: storageMode === "protected",
    hasConflict: persistence.conflictState === "conflict",
    isExternallyDeleted: persistence.conflictState === "externallyDeleted",
    canvasSelection,
    nodes,
    layoutMode,
    layoutStyle,
    treeDirection,
    layoutSpacing,
    selectedNodeId,
    selectedNodeIds,
    selectedNodeLocked: selectedNode?.locked === true,
    setLayoutStyle,
    setTreeDirection,
    setLayoutSpacing,
    commitManualNodes,
    toggleNodeEditLock,
    lockNodeSubtree,
    unlockNodeSubtree,
    setLabelFontSize,
    toggleLabelBold,
    toggleLabelUnderline,
    layoutEditingBlocked: crossFeatureLocks.layoutEditBlocked,
  });
  const taskEditingDisabled = isProtectedMode || hasMapConflict || isMapExternallyDeleted
    || crossFeatureLocks.attributeEditBlocked || selectedNode?.locked === true;
  const { commitTask, commitCustomAttribute, getAttributeGeneration } = useNodeTaskAttributeEditing(
    taskNodeId,
    documentRevision,
    taskEditingDisabled,
    applyTask,
    applyCustomAttribute,
  );
  const presentationStartControlDisabled = presentationStartDisabledFromTour
    || crossFeatureLocks.presentationStartBlockedByLearn
    || crossFeatureLocks.presentationStartBlockedByVoice
    || collabPresentationBlocked !== null;
  // 入口をすべて同じ値で止める（L-061）。commandPalette.screen === "closed" を積に含める
  // 相手ピッカーは modal 束外（音声は専用 reason）だが inert／shortcuts は停止（設計 §10）
  // reconnecting / connecting / error 中は共同編集の入力ブロック（キューしない）
  const editorShortcutsEnabled = shortcutsEnabled
    && !editorModalsBlockEditing
    && relationPartnerFromId === null
    && !learningActive
    && !listening
    && collabInputBlocked === null;
  const collabActive = collab.collabSession.status === "active";
  const effectiveCanUndo = collabActive ? collab.canYjsUndo : canUndo;
  const effectiveCanRedo = collabActive ? collab.canYjsRedo : canRedo;
  const effectiveUndo = collabActive ? collab.yjsUndo : undo;
  const effectiveRedo = collabActive ? collab.yjsRedo : redo;
  useMapHistoryShortcuts({
    undo: effectiveUndo,
    redo: effectiveRedo,
    enabled: editorShortcutsEnabled || listening,
  });
  useCrossMapSearchShortcut({
    enabled: editorShortcutsEnabled,
    onOpen: crossMapDialogs.openCrossMapSearch,
  });
  const outlineModel = useMemo(() => buildOutlineRows(nodes), [nodes]);
  const exportOutlineModel = useMemo(
    () => buildOutlineRows(exportDocumentNodes),
    [exportDocumentNodes],
  );
  const exchangeClosedNodes = useMemo(
    () => resolveExchangeExportNodes(
      exportScope,
      nodes,
      displayState.visibleNodeIds,
      selectionTargetIds,
    ),
    [exportScope, nodes, displayState.visibleNodeIds, selectionTargetIds],
  );
  const exchangeExport = useExchangeExport({
    closedNodes: exchangeClosedNodes,
    mapName,
  });
  const outlineExport = useOutlineExport({ model: exportOutlineModel, mapName });
  const outlineActions = useOutlineEditorActions({
    nodes, selectedNodeId, documentRevision,
    enabled: (editorShortcutsEnabled || learningActive) && viewMode === "outline",
    learningActive,
    model: outlineModel,
    api: {
      selectNode: handleSelectNodeWithLearn,
      updateNodeLabel,
      insertForest,
      addChildNode,
      addSiblingNode,
      reorderSibling,
      changeNodeIndent,
      deleteNodeOnly,
    },
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
  const pendingViewModeFocusRef = useRef<EditorViewMode | null>(null);
  const pendingMapSearchFocusRef = useRef(false);
  const applyViewModeCore = useCallback((nextMode: EditorViewMode) => {
    if (nextMode === viewModeRef.current) return;
    viewNavigation.clearCanvasFocus();
    // 関連線／グループ選択のままアウトラインへ行くと isNodeOpBlocked で構造操作が止まる（inventory: 無関係）
    if (nextMode === "outline") {
      clearNonNodeSelection();
      viewNavigation.rememberOutlineViewport();
    }
    if (nextMode === "map") {
      setViewportScale(INITIAL_VIEWPORT.scale);
      resolutionFilter.resetViewportScale(INITIAL_VIEWPORT.scale);
      returnToCanvas();
    }
    pendingViewModeFocusRef.current = nextMode;
    setViewMode(nextMode);
  }, [viewModeRef, viewNavigation, resolutionFilter, returnToCanvas, clearNonNodeSelection]);
  const [awaitingPresentationMap, setAwaitingPresentationMap] = useState(false);
  const {
    isNarrowViewport,
    userChoseMapOnNarrow,
    recordManualViewModeChange,
  } = useNarrowViewport({
    mapId,
    storageMode,
    viewMode,
    applyViewMode: applyViewModeCore,
    suppressOutlineOverride: playingPresentation || awaitingPresentationMap,
  });
  const applyViewMode = useCallback((nextMode: EditorViewMode) => {
    recordManualViewModeChange(nextMode);
    applyViewModeCore(nextMode);
  }, [applyViewModeCore, recordManualViewModeChange]);
  function changeViewMode(nextMode: EditorViewMode) {
    if (!editorShortcutsEnabled || playingPresentation) return;
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
  useLearnRevealKeyboard({
    enabled: learningActive
      && commandPalette.screen === "closed"
      && !learnMode.reviewCardsPanelOpen
      && !learnMode.resetDialogOpen,
    onReveal: () => {
      if (selectedNodeId !== null) attemptRevealLearnNode(selectedNodeId);
    },
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
        canUndo: effectiveCanUndo,
        canRedo: effectiveCanRedo,
        canFitAll: displayState.fitNodes.length > 0,
        // §10: 関連線／グループ選択中はノード対象のパレット項目を無効
        canFitSelection: !nodeOpsBlockedByCanvasSelection && selectedFitNodes.length > 0,
        canFocusBranch: !nodeOpsBlockedByCanvasSelection && selectedBranchIds !== null,
        canExpandSubtree: !nodeOpsBlockedByCanvasSelection && canExpandSelectedBranch,
        canCollapseSubtree: !nodeOpsBlockedByCanvasSelection && canCollapseSelectedBranch,
        canDuplicate: !nodeOpsBlockedByCanvasSelection && selectedNode !== null,
        // アウトライン時は allNodeIds 基準（マップの visibleNodeIds と不一致になりうる）
        canDeleteNodeOnly:
          !nodeOpsBlockedByCanvasSelection
          && (viewMode === "outline" ? outlineActions.structureCanDelete : nodeOnlyDeletion.canDelete),
        canInsertParent: !nodeOpsBlockedByCanvasSelection && nodeParentInsertion.canInsert,
        canMoveSiblingUp:
          !nodeOpsBlockedByCanvasSelection
          && (viewMode === "outline" ? outlineActions.structureCanMoveUp : siblingReorder.canMoveUp),
        canMoveSiblingDown:
          !nodeOpsBlockedByCanvasSelection
          && (viewMode === "outline" ? outlineActions.structureCanMoveDown : siblingReorder.canMoveDown),
        canIndent:
          !nodeOpsBlockedByCanvasSelection
          && (viewMode === "outline" ? outlineActions.structureCanIndent : nodeIndent.canIndent),
        canOutdent:
          !nodeOpsBlockedByCanvasSelection
          && (viewMode === "outline" ? outlineActions.structureCanOutdent : nodeIndent.canOutdent),
        canOpenLabelReplace: !nodeOpsBlockedByCanvasSelection && nodes.length > 0,
        canOpenBranchMove: !nodeOpsBlockedByCanvasSelection && selectedNode !== null,
        canOpenNodeSplit: !nodeOpsBlockedByCanvasSelection && nodeSplit.canOpen,
        nodeSplitDisabledReason: nodeSplit.disabledReason,
        canOpenNodeMerge: !nodeOpsBlockedByCanvasSelection && nodeMerge.canOpen,
        nodeMergeDisabledReason: nodeMerge.disabledReason,
        canOpenAiBranchSummary: !nodeOpsBlockedByCanvasSelection && aiSummaryEntry.enabled,
        aiBranchSummaryDisabledReason: aiSummaryEntry.enabled ? null : aiSummaryEntry.reason,
        canOpenAiImportance: !nodeOpsBlockedByCanvasSelection && aiImportanceEntry.enabled,
        aiImportanceDisabledReason: aiImportanceEntry.enabled ? null : aiImportanceEntry.reason,
        canOpenAiChildCandidates: !nodeOpsBlockedByCanvasSelection && aiChildEntry.enabled,
        aiChildCandidatesDisabledReason: aiChildEntry.enabled ? null : aiChildEntry.reason,
        canOpenAiClassifyReorder: !nodeOpsBlockedByCanvasSelection && aiClassifyEntry.enabled,
        aiClassifyReorderDisabledReason: aiClassifyEntry.enabled ? null : aiClassifyEntry.reason,
        canOpenAiDuplicates: !nodeOpsBlockedByCanvasSelection && aiDuplicatesEntry.enabled,
        aiDuplicatesDisabledReason: aiDuplicatesEntry.enabled ? null : aiDuplicatesEntry.reason,
        canOpenAiMissingPerspectives: !nodeOpsBlockedByCanvasSelection && aiPerspectivesEntry.enabled,
        aiMissingPerspectivesDisabledReason: aiPerspectivesEntry.enabled ? null : aiPerspectivesEntry.reason,
        canRegisterPart: !nodeOpsBlockedByCanvasSelection && partsLibrary.canRegister,
        canInsertPart: !nodeOpsBlockedByCanvasSelection && partsLibrary.parts.length > 0,
        canDeletePart: partsLibrary.parts.length > 0,
        canFocusInMapSearch: viewMode === "map",
        canOpenCrossMapSearch: true,
        outlineDuplicateIds: outlineModel.duplicateIds,
        outlineInvalidStructure: outlineModel.invalidStructure,
        outlineSelectedVisible: selectedNodeId !== null && outlineModel.allNodeIds.has(selectedNodeId),
        learningActive,
        playingPresentation,
        canLearnStart: learnStartBlockedReason === null && !learningActive && !listening,
        voiceListening: listening,
        canVoiceInputStart,
        canVoiceInputStop,
        voiceStartDisabledReason,
        collabBulkBlockedReason: collabBulkBlocked,
        canLearnEnd: learningActive,
        canLearnReset: learningActive && learnResetBlockedReason === null,
        canLearnGenerateCards: learningActive && learnGenerateBlockedReason === null,
        canLearnOpenCards: learningActive,
        learnStartDisabledReason: learnStartBlockedReason,
        learnResetDisabledReason: learnResetBlockedReason,
        learnGenerateDisabledReason: learnGenerateBlockedReason,
      }),
    [
      viewMode, selectedNodeId, focusRootId, storageMode, persistence.conflictState,
      learningActive, playingPresentation, listening, learnStartBlockedReason, learnResetBlockedReason,
      learnGenerateBlockedReason, canVoiceInputStart, canVoiceInputStop, voiceStartDisabledReason,
      collabBulkBlocked,
      nodeOpsBlockedByCanvasSelection,
      effectiveCanUndo, effectiveCanRedo, displayState.fitNodes.length, selectedFitNodes.length, selectedBranchIds,
      canExpandSelectedBranch, canCollapseSelectedBranch, selectedNode, nodeOnlyDeletion.canDelete,
      nodeParentInsertion.canInsert, siblingReorder.canMoveUp, siblingReorder.canMoveDown,
      nodeIndent.canIndent, nodeIndent.canOutdent, outlineActions.structureCanDelete,
      outlineActions.structureCanMoveUp, outlineActions.structureCanMoveDown,
      outlineActions.structureCanIndent, outlineActions.structureCanOutdent, nodes.length,
      nodeSplit.canOpen, nodeSplit.disabledReason, nodeMerge.canOpen, nodeMerge.disabledReason,
      aiSummaryEntry, aiImportanceEntry, aiChildEntry, aiClassifyEntry, aiDuplicatesEntry, aiPerspectivesEntry,
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
      undo: effectiveUndo,
      redo: effectiveRedo,
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
      startLearn: () => startLearnFromPalette(),
      endLearn: () => endLearnFromPalette(),
      generateLearnCards: () => handleGenerateLearnReviewCards(),
      startVoiceInput: () => startVoiceFromPalette(),
      stopVoiceInput: () => stopVoiceFromPalette(),
    });
  }, [
    viewMode, selectedNodeId, displayState.fitNodes, selectedFitNodes, recordBeforeViewportChange,
    setFocusRootId, branchCollapse, effectiveUndo, effectiveRedo, duplication, outlineActions, nodeOnlyDeletion,
    nodeParentInsertion, moveSelectedSiblingUp, moveSelectedSiblingDown, indentSelected, outdentSelected,
    applyViewMode, endLearnFromPalette, handleGenerateLearnReviewCards, startLearnFromPalette,
    startVoiceFromPalette, stopVoiceFromPalette,
  ]);
  const openDialogCommand = useCallback((id: CommandId) => {
    openCommandPaletteDialog(id, {
      openLabelReplace: () => {
        if (collabBulkBlocked !== null) return;
        labelReplace.open();
      },
      openBranchMove: () => {
        if (collabBulkBlocked !== null) return;
        branchMove.open();
      },
      openNodeSplit: () => {
        if (collabBulkBlocked !== null) return;
        nodeSplit.open();
      },
      openNodeMerge: () => {
        if (collabBulkBlocked !== null) return;
        nodeMerge.open();
      },
      openAiBranchSummary: () => openAiAssist("branch-summary", "palette"),
      openAiImportance: () => openAiAssist("importance", "palette"),
      openAiChildCandidates: () => openAiAssist("child-candidates", "palette"),
      openAiClassifyReorder: () => openAiAssist("classify-reorder", "palette"),
      openAiDuplicates: () => openAiAssist("duplicates", "palette"),
      openAiMissingPerspectives: () => openAiAssist("missing-perspectives", "palette"),
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
      openLearnReset: () => {
        learnMode.openResetDialog();
      },
      openLearnCards: () => {
        handleOpenLearnReviewCards();
      },
    });
  }, [collabBulkBlocked, labelReplace, branchMove, handleOpenLearnReviewCards, learnMode, nodeSplit, nodeMerge, openAiAssist, crossMapDialogs, partsLibrary]);
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
    print.notice,
    outlineExport.notice,
    exchangeExport.notice,
    duplication.notice,
    clipboardNotice,
    nodeSearchNotice,
    navigationNotice,
    outlineImport.notice,
    exchangeImport.notice,
    treeEditNotice,
    commandPaletteNotice,
    learnNotice,
    voiceNotice,
    persistence.conflictActionNotice,
  ];

  // 閉じる描画で根の inert が外れた後に当てる（L-155）。"input"・"preview" はダイアログが当てる
  useLayoutEffect(() => {
    if (outlineFocusRequest !== "header") return;
    outlineImportButtonRef.current?.focus();
    consumeOutlineFocusRequest();
  }, [outlineFocusRequest, consumeOutlineFocusRequest]);

  useLayoutEffect(() => {
    if (exchangeFocusRequest !== "header") return;
    const focusButton = exchangeLastEntry === "csv-tsv"
      ? exchangeCsvButtonRef.current
      : exchangeOpmlButtonRef.current;
    focusButton?.focus();
    consumeExchangeFocusRequest();
  }, [exchangeFocusRequest, consumeExchangeFocusRequest, exchangeLastEntry]);

  const pendingPresentationStartRef = useRef(false);
  const handleNodeSearchSelect = useCallback((nodeId: number) => {
    if (crossFeatureLocks.layoutEditBlocked) return;
    navigateToNode(nodeId);
  }, [crossFeatureLocks.layoutEditBlocked, navigateToNode]);
  const handlePresentationStart = useCallback(() => {
    if (crossFeatureLocks.presentationStartBlockedByLearn) {
      publishPresentationBlockedDuringLearn();
      return;
    }
    if (crossFeatureLocks.presentationStartBlockedByVoice) {
      publishCommandPaletteNotice({
        kind: "status",
        message: MAP_VOICE_MESSAGES.listeningBlock,
      });
      return;
    }
    if (viewMode !== "map") {
      pendingPresentationStartRef.current = true;
      // 自動切替は手動フラグを立てず、狭幅 outline 強制だけ一時抑制する（§5.2）
      setAwaitingPresentationMap(true);
      applyViewModeCore("map");
      return;
    }
    presentationPlayback.start();
  }, [
    applyViewModeCore,
    crossFeatureLocks.presentationStartBlockedByLearn,
    crossFeatureLocks.presentationStartBlockedByVoice,
    presentationPlayback,
    publishCommandPaletteNotice,
    publishPresentationBlockedDuringLearn,
    viewMode,
  ]);
  useEffect(() => {
    if (viewMode !== "map" || !pendingPresentationStartRef.current) return;
    if (viewportHandleRef.current?.getScreenSize() === null) return;
    presentationPlayback.start();
    pendingPresentationStartRef.current = false;
    setAwaitingPresentationMap(false);
  }, [viewMode, viewportFrame, presentationPlayback]);
  useEffect(() => {
    if (playingPresentation || pendingPresentationStartRef.current) return;
    setAwaitingPresentationMap(false);
  }, [playingPresentation]);

  const voiceInputControl = (
    <VoiceInputControl
      voiceListening={listening}
      interimTranscript={interimTranscript}
      onVoiceToggle={handleVoiceToggle}
      disabled={
        (voiceStartDisabledReason !== null && !listening)
        || (collabVoiceBlocked !== null && !listening)
      }
      isNarrowViewport={isNarrowViewport}
      userChoseMapOnNarrow={userChoseMapOnNarrow}
      buttonRef={voiceInputButtonRef}
    />
  );

  const dockSlotNodes = {
    undoRedo: (
      <MapHistoryControls
        canUndo={effectiveCanUndo && (editorShortcutsEnabled || listening) && !playingPresentation}
        canRedo={effectiveCanRedo && (editorShortcutsEnabled || listening) && !playingPresentation}
        onUndo={effectiveUndo}
        onRedo={effectiveRedo}
      />
    ),
    commandPalette: (
      <CommandPaletteControl
        expanded={commandPalette.screen === "open"}
        onOpen={openCommandPalette}
        buttonRef={commandPaletteButtonRef}
      />
    ),
    wheelZoom: (
      <WheelZoomSensitivityControl
        value={uiPrefs.wheelZoomSensitivity}
        onChange={setWheelZoomSensitivity}
      />
    ),
    importance: (
      <NodeImportanceSelector
        importance={importanceSummary.kind === "uniform" ? importanceSummary.importance : null}
        disabled={importanceSummary.kind === "none" || playingPresentation}
        selectionCount={importanceSummary.kind === "none" ? 0 : importanceSummary.count}
        mixed={importanceSummary.kind === "mixed"}
        onChange={(importance) => {
          updateNodesImportance(importanceTargetIds, importance);
        }}
      />
    ),
    collapse: (
      <NodeCollapseControl
        selectedNodeId={selectedNodeId}
        canToggle={selectedNodeId !== null && branchCollapse.canToggle(selectedNodeId)}
        collapsed={selectedNodeId !== null && branchCollapse.collapsedNodeIds.has(selectedNodeId)}
        hiddenCount={selectedNodeId === null ? 0 : branchCollapse.hiddenCountById.get(selectedNodeId) ?? 0}
        onToggle={branchCollapse.toggle}
        disabled={playingPresentation}
      />
    ),
    duplicateBranch: (
      <NodeDuplicateControl
        disabled={selectedNode === null || !editorShortcutsEnabled}
        onDuplicate={duplication.duplicateSelected}
      />
    ),
    moveBranch: (
      <BranchMoveControl
        expanded={branchMove.screen !== "closed"}
        disabled={selectedNode === null || !editorShortcutsEnabled || collabBulkBlocked !== null}
        onOpen={branchMove.open}
        buttonRef={branchMoveButtonRef}
      />
    ),
    reorderSiblings: (
      <NodeSiblingOrderControl
        canMoveUp={siblingReorder.canMoveUp && editorShortcutsEnabled}
        canMoveDown={siblingReorder.canMoveDown && editorShortcutsEnabled}
        onMoveUp={moveSelectedSiblingUp}
        onMoveDown={moveSelectedSiblingDown}
      />
    ),
    changeHierarchy: (
      <NodeIndentControl
        canOutdent={nodeIndent.canOutdent && editorShortcutsEnabled}
        canIndent={nodeIndent.canIndent && editorShortcutsEnabled}
        onOutdent={outdentSelected}
        onIndent={indentSelected}
      />
    ),
    insertParent: (
      <NodeParentInsertControl
        canInsert={nodeParentInsertion.canInsert && editorShortcutsEnabled}
        onInsert={nodeParentInsertion.insertSelected}
      />
    ),
    deleteNodeOnly: (
      <NodeOnlyDeleteControl
        canDelete={nodeOnlyDeletion.canDelete && editorShortcutsEnabled}
        onDelete={nodeOnlyDeletion.deleteSelected}
      />
    ),
    bulkReplace: (
      <LabelReplaceControl
        expanded={labelReplace.screen !== "closed"}
        disabled={nodes.length === 0 || !editorShortcutsEnabled || collabBulkBlocked !== null}
        onOpen={labelReplace.open}
        buttonRef={labelReplaceButtonRef}
      />
    ),
    splitMerge: (
      <>
        <NodeSplitControl
          expanded={nodeSplit.screen !== "closed"}
          disabled={!nodeSplit.canOpen || !editorShortcutsEnabled || collabBulkBlocked !== null}
          disabledReason={collabBulkBlocked ?? nodeSplit.disabledReason}
          onOpen={nodeSplit.open}
          buttonRef={nodeSplitButtonRef}
        />
        <NodeMergeControl
          expanded={nodeMerge.screen !== "closed"}
          disabled={!nodeMerge.canOpen || !editorShortcutsEnabled || collabBulkBlocked !== null}
          disabledReason={collabBulkBlocked ?? nodeMerge.disabledReason}
          onOpen={nodeMerge.open}
          buttonRef={nodeMergeButtonRef}
        />
      </>
    ),
    branchNav: (
      <BranchNavigationControls
        breadcrumb={breadcrumb}
        focusing={focusRootId !== null}
        canGoBack={editorShortcutsEnabled && viewNavigation.canGoBack}
        canGoForward={editorShortcutsEnabled && viewNavigation.canGoForward}
        onTravel={(direction) => {
          if (!editorShortcutsEnabled) return;
          if (viewNavigation.travel(direction)) canvasContainerRef.current?.focus();
        }}
        canFocus={editorShortcutsEnabled && selectedBranchIds !== null}
        canExpand={editorShortcutsEnabled && canExpandSelectedBranch}
        canCollapse={editorShortcutsEnabled && canCollapseSelectedBranch}
        canFitAll={editorShortcutsEnabled && displayState.fitNodes.length > 0}
        canFitSelection={editorShortcutsEnabled && selectedFitNodes.length > 0}
        onFitAll={() => {
          if (!editorShortcutsEnabled) return;
          viewportHandleRef.current?.fitNodes(displayState.fitNodes, recordBeforeViewportChange);
        }}
        onFitSelection={() => {
          if (!editorShortcutsEnabled) return;
          viewportHandleRef.current?.fitNodes(selectedFitNodes, recordBeforeViewportChange);
        }}
        onToggleFocus={() => {
          if (!editorShortcutsEnabled) return;
          const nextFocusId = focusRootId === null ? selectedNodeId : null;
          if (nextFocusId === focusRootId) return;
          recordBeforeViewportChange();
          setFocusRootId(nextFocusId);
        }}
        onSetSubtreeCollapsed={(collapsed) => {
          if (!editorShortcutsEnabled) return;
          if (selectedNodeId !== null) branchCollapse.setSubtreeCollapsed(selectedNodeId, collapsed);
        }}
        onNavigate={(id) => {
          if (!editorShortcutsEnabled) return;
          if (navigateToNode(id) !== "missing") canvasContainerRef.current?.focus();
        }}
      />
    ),
    viewBookmarks: (
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
    ),
    resolutionFilter: (
      <ResolutionFilterSelector
        mode={resolutionFilter.mode}
        level={resolutionFilter.level}
        onChange={resolutionFilter.setMode}
      />
    ),
    depthLimit: (
      <DepthLimitControl maxDepth={maxDepth} onChange={setMaxDepth} />
    ),
    highlightMode: (
      <HighlightModeControl mode={highlightMode} onChange={setHighlightMode} />
    ),
    nodePins: (
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
    ),
    tour: (
      <TourEditorControl
        expanded={tourEditor.screen === "open"}
        disabled={tourHeaderDisabled}
        onOpen={tourEditor.open}
        buttonRef={tourEditorButtonRef}
      />
    ),
    presentation: (
      <PresentationStartControl
        disabled={presentationStartControlDisabled}
        onStart={handlePresentationStart}
        buttonRef={presentationStartButtonRef}
      />
    ),
    learnMode: (
      <>
        <LearnModeControl
          learningActive={learningActive}
          disabled={
            playingPresentation
            || hasMapConflict
            || isMapExternallyDeleted
            || collabLearnBlocked !== null
            || (!learningActive && (learnStartBlockedReason !== null || listening))
          }
          onToggle={handleToggleLearnMode}
          buttonRef={learnModeButtonRef}
        />
        {learningActive && (
          <>
            <button
              type="button"
              className="shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200"
              disabled={learnGenerateBlockedReason !== null}
              onClick={() => handleGenerateLearnReviewCards()}
            >
              復習カードを生成
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
              onClick={() => handleOpenLearnReviewCards()}
            >
              復習カード
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200"
              disabled={learnResetBlockedReason !== null}
              onClick={() => learnMode.openResetDialog()}
            >
              進捗をリセット
            </button>
          </>
        )}
      </>
    ),
    voiceInput: voiceInputControl,
    importBullets: (
      <OutlineImportControl
        expanded={outlineImport.screen !== "closed"}
        disabled={!editorShortcutsEnabled || collabOutlineImportBlocked !== null}
        onOpen={outlineImport.open}
        buttonRef={outlineImportButtonRef}
      />
    ),
    importOpmlCsv: (
      <ExchangeImportControl
        opmlExpanded={exchangeImport.screen !== "closed" && exchangeImport.entry === "opml"}
        csvExpanded={exchangeImport.screen !== "closed" && exchangeImport.entry === "csv-tsv"}
        disabled={!editorShortcutsEnabled || collabOutlineImportBlocked !== null}
        onOpen={exchangeImport.open}
        opmlButtonRef={exchangeOpmlButtonRef}
        csvButtonRef={exchangeCsvButtonRef}
      />
    ),
    exportTarget: (
      <ExportScopeControl
        scope={exportScope}
        onChange={setExportScope}
        selectionAvailable={selectionScopeAvailable}
      />
    ),
    exportJson: (
      <MapPersistenceControls
        onExport={handleExportJson}
        onImport={persistence.importJsonFile}
        exportButtonRef={exportButtonRef}
        jsonExportEnabled={effectiveExportFormatControls.json.enabled}
        jsonExportDisabledReason={effectiveExportFormatControls.json.disabledReason}
        jsonImportEnabled={editorShortcutsEnabled && collabJsonImportBlocked === null}
      />
    ),
    exportPngSvg: (
      <MapImageExportControls
        onExportPng={imageExport.exportPng}
        onExportSvg={imageExport.exportSvg}
        isExportingPng={imageExport.isExportingPng}
        pngEnabled={effectiveExportFormatControls.png.enabled}
        svgEnabled={effectiveExportFormatControls.svg.enabled}
        pngDisabledReason={effectiveExportFormatControls.png.disabledReason}
        svgDisabledReason={effectiveExportFormatControls.svg.disabledReason}
      />
    ),
    printPdf: (
      <MapPrintControls
        nodes={exportNodes}
        {...effectiveExportFormatControls.print}
        canOpen={editorShortcutsEnabled && effectiveExportFormatControls.print.enabled}
        open={printSettingsOpen}
        onOpen={() => setPrintSettingsOpen(true)}
        onClose={() => setPrintSettingsOpen(false)}
        print={print}
        onMouseClick={() => {
          dialogMouseClickedAtRef.current = Date.now();
        }}
      />
    ),
    exportMdBullets: (
      <OutlineExportControls
        onExportMarkdown={outlineExport.exportMarkdown}
        onExportPlainText={outlineExport.exportPlainText}
        markdownEnabled={effectiveExportFormatControls.markdown.enabled}
        plainTextEnabled={effectiveExportFormatControls.bullets.enabled}
        markdownDisabledReason={effectiveExportFormatControls.markdown.disabledReason}
        plainTextDisabledReason={effectiveExportFormatControls.bullets.disabledReason}
      />
    ),
    exportOpmlCsvTsv: (
      <ExchangeExportControls
        onExportOpml={exchangeExport.exportOpml}
        onExportCsv={exchangeExport.exportCsv}
        onExportTsv={exchangeExport.exportTsv}
        opmlEnabled={effectiveExportFormatControls.opml.enabled}
        csvEnabled={effectiveExportFormatControls.csv.enabled}
        tsvEnabled={effectiveExportFormatControls.tsv.enabled}
        opmlDisabledReason={effectiveExportFormatControls.opml.disabledReason}
        csvDisabledReason={effectiveExportFormatControls.csv.disabledReason}
        tsvDisabledReason={effectiveExportFormatControls.tsv.disabledReason}
      />
    ),
    collab: (
      <CollabControl
        collabSession={collab.collabSession}
        participants={collab.participants}
        participantsState={collab.participantsState}
        onStartCollab={collab.onStartCollab}
        onLeaveCollab={collab.onLeaveCollab}
        onEndCollab={collab.onEndCollab}
        onRetryCollab={collab.onRetryCollab}
        shareSession={shareSession}
        startDisabledReason={collab.startDisabledReason}
      />
    ),
    share: (
      <ShareControl
        expanded={shareDialogOpen}
        disabled={shareOpenBlockedReason !== null}
        disabledReason={shareOpenBlockedReason ?? undefined}
        onOpen={handleShareControlOpen}
        buttonRef={shareButtonRef}
      />
    ),
    comments: (
      <CommentsControl
        expanded={commentsDialog.open}
        disabled={commentsControlDisabledReason !== null}
        disabledReason={commentsControlDisabledReason ?? undefined}
        onOpen={() => openComments("all")}
        buttonRef={commentsDialog.buttonRef}
      />
    ),
  } as const;

  const dockSlots = buildEditorDockSlots({
    visibleSlotIds: uiPrefs.dockLayout.visibleSlotIds,
    viewMode,
    nodesById: dockSlotNodes,
  });

  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-map-id={mapId}
        inert={!editorShortcutsEnabled && !playingPresentation && !learningActive && !listening}
      >
        <AppHeader
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          layoutModeDisabled={playingPresentation}
          layoutDirectionControls={headerLayoutControls
            ? <MapHeaderLayoutControls {...headerLayoutControls} />
            : null}
          mapControls={effectiveMapControls}
          saveStatus={persistence.saveStatus}
          isNarrowViewport={isNarrowViewport}
          userChoseMapOnNarrow={userChoseMapOnNarrow}
          viewControls={(
            <EditorViewModeControl
              mode={viewMode}
              onChange={changeViewMode}
              disabled={playingPresentation || listening}
            />
          )}
          searchControls={(
            <div className="flex flex-wrap items-center gap-2">
              {viewMode === "map" && (
                <NodeSearchBox
                  query={nodeSearch.query}
                  onQueryChange={nodeSearch.setQuery}
                  hasQuery={nodeSearch.hasQuery}
                  matches={nodeSearch.matches}
                  total={nodeSearch.total}
                  onSelectResult={handleNodeSearchSelect}
                  inputRef={nodeSearchInputRef}
                  disabled={playingPresentation || listening}
                />
              )}
              <button
                ref={crossMapSearchButtonRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={crossMapDialogs.crossMapSearchOpen}
                disabled={playingPresentation || listening || collabMapSwitchBlocked !== null}
                title={collabMapSwitchBlocked ?? undefined}
                onClick={() => {
                  if (playingPresentation || listening || collabMapSwitchBlocked !== null) return;
                  crossMapDialogs.openCrossMapSearch();
                }}
                className="shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                全マップ検索
              </button>
            </div>
          )}
          operationNotices={hasOperationNotice(operationNotices)
            ? <MapOperationNoticeList notices={operationNotices} />
            : null}
        />
        <div
          className="flex min-h-0 flex-1 flex-col"
          inert={listening}
        >
        <MapConflictNotice
          conflictState={
            isCollabTabConflictGuardEnabled(collab.collabSession)
              ? persistence.conflictState
              : "none"
          }
          onSaveAsCopy={persistence.handleSaveAsCopy}
          onReloadExternal={persistence.handleReloadExternal}
          onExportJson={persistence.exportJson}
        />
        <AppWorkspace
          canvas={viewMode === "outline" ? (
            <OutlineEditor learnDisplay={learnDisplay} nodes={nodes} taskProgress={taskProgress} model={outlineModel} selectedNodeId={selectedNodeId}
              documentRevision={documentRevision} enabled={editorShortcutsEnabled || learningActive} actions={outlineActions}
              onLearnRevealNode={attemptRevealLearnNode} />
          ) : (
            <div className="relative h-full min-h-0 w-full">
              {maxDepth !== null
                && nodes.length > 0
                && displayState.visibleNodeIds.size === 0 && (
                <div className="absolute left-3 top-3 z-10 max-w-lg">
                  <DepthLimitEmptyHint onResetToUnlimited={() => setMaxDepth(null)} />
                </div>
              )}
              <PresenceLayer
                remoteSelections={collab.remoteSelections}
                remoteViewports={collab.remoteViewports}
                participants={collab.participants}
                nodes={displayState.displayNodes}
                viewport={viewportFrame?.viewport ?? INITIAL_VIEWPORT}
              />
              <MapStage
                learnDisplay={learnDisplay}
                taskProgress={taskProgress}
                canvasContainerRef={canvasContainerRef}
                viewportHandleRef={viewportHandleRef}
                nodes={displayState.displayNodes}
                focusRequest={canvasFocus.request}
                highlightNodeIds={highlightNodeIds}
                pinnedNodeIds={nodePins.pinnedNodeIds}
                commentNodeCounts={comments.openCountByNode}
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
                relations={relations}
                groups={groups}
                canvasSelection={canvasSelection}
                onSelectRelation={selectRelation}
                onDeleteRelation={(relationId) => {
                  removeRelation(relationId);
                }}
                onBeginRelationAdd={(fromId) => {
                  setRelationPartnerFromId(fromId);
                }}
                onConnectRelation={(fromId, toId) => {
                  addRelation(fromId, toId);
                }}
                onSelectGroup={selectGroup}
                onDeleteGroup={(groupId) => {
                  removeGroup(groupId);
                }}
                onCreateGroup={(nodeIds) => {
                  addGroup(nodeIds);
                }}
                onDoubleClick={addNode}
                onAddChildNode={addChildNodeExpanding}
                onAddSiblingNode={addSiblingNode}
                onSelectNode={handleSelectNodeWithLearn}
                onToggleNodeSelection={toggleNodeSelection}
                onSelectNodeRange={selectNodeRange}
                onSetSelectionFromMarquee={setSelectionFromMarquee}
                onClearSelection={clearSelection}
                pruneSelectionToVisible={pruneSelectionToVisible}
                onUpdateLabel={updateNodeLabel}
                onMoveNode={moveNode}
                onBeginNodeMove={beginMoveHistory}
                onMovePinnedNode={pinnedNodeDragCallbacks.onMovePinnedNode}
                onFinalizePinnedNodeMove={pinnedNodeDragCallbacks.onFinalizePinnedNodeMove}
                onSetNodeLayoutPinned={(nodeId, pinned) => {
                  setNodeLayoutPinned(nodeId, pinned);
                }}
                onSetBranchLayout={(nodeId, direction) => {
                  setBranchLayout(nodeId, direction);
                }}
                layoutStyle={layoutStyle}
                branchLayouts={branchLayouts}
                treeDirection={treeDirection}
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
                onBeginBranchExtract={branchExtract.open}
                isProtectedMode={storageMode === "protected"}
                hasMapConflict={persistence.conflictState === "conflict"}
                isExternallyDeleted={persistence.conflictState === "externallyDeleted"}
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
              {playingPresentation && (
                <PresentationPlaybackBar
                  stepIndex={presentationPlayback.stepIndex}
                  stepCount={presentationPlayback.stepCount}
                  caption={presentationPlayback.currentStep?.caption}
                  canGoBack={presentationPlayback.canGoBack}
                  canGoForward={presentationPlayback.canGoForward}
                  onBack={presentationPlayback.goBack}
                  onForward={presentationPlayback.goForward}
                  onEnd={presentationPlayback.end}
                />
              )}
            </div>
          )}
          sidePanel={(
            <NodeDetailPanel
              selectedNode={selectedNode}
              selectedRelation={selectedRelation}
              relationEditDisabled={relationEditDisabled || playingPresentation}
              selectedGroup={selectedGroup}
              groupEditDisabled={groupEditDisabled || playingPresentation}
              attributeEditDisabled={crossFeatureLocks.attributeEditBlocked}
              taskEditing={taskNodeId === null ? null : { disabled: taskEditingDisabled, commitTask }}
              customAttributeEditing={taskNodeId === null ? null : {
                disabled: taskEditingDisabled,
                commitCustomAttribute,
                getAttributeGeneration,
              }}
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
              aiAssist={{
                summary: aiAssist.summaryEntry,
                importance: aiAssist.importanceEntry,
                childCandidates: aiAssist.childEntry,
                classifyReorder: aiAssist.classifyEntry,
                duplicates: aiAssist.duplicatesEntry,
                missingPerspectives: aiAssist.perspectivesEntry,
                summaryButtonRef: aiSummaryButtonRef,
                importanceButtonRef: aiImportanceButtonRef,
                childCandidatesButtonRef: aiChildCandidatesButtonRef,
                classifyReorderButtonRef: aiClassifyReorderButtonRef,
                duplicatesButtonRef: aiDuplicatesButtonRef,
                missingPerspectivesButtonRef: aiMissingPerspectivesButtonRef,
                onOpenSummary: () => openAiAssist("branch-summary", "panel"),
                onOpenImportance: () => openAiAssist("importance", "panel"),
                onOpenChildCandidates: () => openAiAssist("child-candidates", "panel"),
                onOpenClassifyReorder: () => openAiAssist("classify-reorder", "panel"),
                onOpenDuplicates: () => openAiAssist("duplicates", "panel"),
                onOpenMissingPerspectives: () => openAiAssist("missing-perspectives", "panel"),
              }}
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
              layoutPinnedVisible={layoutPinnedPanel.visible}
              layoutPinnedDisabled={layoutPinnedPanel.disabled || playingPresentation}
              onSetLayoutPinned={(nodeId, pinned) => {
                setNodeLayoutPinned(nodeId, pinned);
              }}
              onUpdateRelationKind={(relationId, kind) => {
                updateRelation(relationId, { kind });
              }}
              onUpdateRelationDirected={(relationId, directed) => {
                updateRelation(relationId, { directed });
              }}
              onUpdateGroupLabel={(groupId, label) => {
                updateGroupLabel(groupId, label);
              }}
              generation={generation}
              onGenerate={generateIllustration}
              onAttach={(nodeId, dataUrl) => {
                if (attachIllustration(nodeId, dataUrl)) dismissGeneration();
              }}
              onRemove={removeIllustration}
              commentSummary={selectedNodeId === null ? null : comments.summaryForNode(selectedNodeId)}
              onOpenNodeComments={sharedMapId === null ? null : openNodeComments}
              openNodeCommentsDisabledReason={commentsBlockedReason}
            />
          )}
        />
        </div>
        <EditorDock
          slots={dockSlots}
          onCustomize={dockCustomize.openCustomize}
          customizeButtonRef={dockCustomize.customizeButtonRef}
          isNarrowViewport={isNarrowViewport}
        />
      </div>
      <DockCustomizeDialog
        open={dockCustomize.open}
        draftVisibleSlotIds={dockCustomize.draftVisibleSlotIds}
        onDraftChange={dockCustomize.setDraftVisibleSlotIds}
        onApply={async () => dockCustomize.applyCustomize()}
        onCancel={dockCustomize.cancelCustomize}
        onResetDefault={dockCustomize.resetDraftToDefault}
        dialogMouseClickedAtRef={dialogMouseClickedAtRef}
        initialFocusRef={dockCustomize.customizeButtonRef}
      />
      {branchExtract.screen === "open" && (
        <BranchExtractDialog
          displayLabel={branchExtract.displayLabel}
          canSubmit={branchExtract.canSubmit}
          error={branchExtract.error}
          focusRequest={branchExtract.focusRequest}
          onFocusRequestApplied={branchExtract.consumeFocusRequest}
          onCancel={branchExtract.close}
          onSubmit={branchExtract.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
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
      {aiAssist.view !== null && (
        <AiAssistDialog
          view={aiAssist.view}
          onClose={aiAssist.close}
          onSend={aiAssist.send}
          onRetry={aiAssist.retry}
          onDecide={aiAssist.decide}
          onNoteModeChange={aiAssist.setNoteMode}
          onApply={aiAssist.apply}
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
      {relationPartnerFromId !== null && (
        <RelationPartnerPickerDialog
          fromId={relationPartnerFromId}
          nodes={nodes}
          relations={relations}
          onPick={(toId) => {
            addRelation(relationPartnerFromId, toId);
            setRelationPartnerFromId(null);
          }}
          onCancel={() => setRelationPartnerFromId(null)}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
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
      {exchangeImport.screen !== "closed" && exchangeImport.entry !== null && (
        <ExchangeImportDialog
          screen={exchangeImport.screen === "preview" ? "preview" : "input"}
          entry={exchangeImport.entry}
          fileName={exchangeImport.fileName}
          delimiter={exchangeImport.delimiter}
          inputError={exchangeImport.inputError}
          parsed={exchangeImport.parsed}
          preview={exchangeImport.preview}
          parentCandidate={resolveOutlineParentCandidate(
            nodes,
            exchangeImport.parentCandidateId,
            exchangeImport.parentCandidateStale,
          )}
          target={exchangeImport.target}
          dialogNotices={exchangeImport.dialogNotices}
          focusRequest={exchangeImport.focusRequest}
          onFocusRequestApplied={exchangeImport.consumeFocusRequest}
          onFileLoad={exchangeImport.setFile}
          onLoadError={exchangeImport.reportInputError}
          onDelimiterChange={exchangeImport.setDelimiter}
          onPreview={exchangeImport.requestPreview}
          onCancel={exchangeImport.close}
          onBack={exchangeImport.back}
          onTargetChange={exchangeImport.setTarget}
          onSubmit={exchangeImport.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      <LearnResetProgressDialog
        open={learnMode.resetDialogOpen}
        onConfirm={handleConfirmLearnReset}
        onCancel={learnMode.closeResetDialog}
      />
      <LearnReviewCardsPanel
        open={learnMode.reviewCardsPanelOpen}
        cards={reviewCards}
        cardIndex={learnMode.reviewCardIndex}
        showingAnswer={learnMode.reviewCardShowingAnswer}
        onClose={learnMode.closeReviewCardsPanel}
        onFlip={learnMode.flipReviewCard}
        onPrevious={() => learnMode.goReviewCardPrevious(reviewCards.length)}
        onNext={() => learnMode.goReviewCardNext(reviewCards.length)}
        onGenerate={() => handleGenerateLearnReviewCards()}
        canGenerate={learnGenerateBlockedReason === null}
        generateDisabledReason={learnGenerateBlockedReason}
      />
      {tourEditor.screen === "open" && (
        <TourEditorDialog
          tour={tour}
          selectedStepId={tourEditor.selectedStepId}
          titleDraft={tourEditor.titleDraft}
          captionDraft={tourEditor.captionDraft}
          editDisabled={tourHeaderDisabled}
          dialogNotices={tourEditor.dialogNotices}
          focusRequest={tourEditor.focusRequest}
          onFocusRequestApplied={tourEditor.consumeFocusRequest}
          onTitleDraftChange={tourEditor.setTitleDraft}
          onCaptionDraftChange={tourEditor.setCaptionDraft}
          onSelectStep={tourEditor.selectStep}
          onPreviewStep={previewTourStep}
          onCreateTour={tourEditor.submitCreateTour}
          onSetTitle={tourEditor.submitSetTitle}
          onRemoveTour={tourEditor.submitRemoveTour}
          onAddStep={tourEditor.submitAddStep}
          onRemoveStep={tourEditor.submitRemoveSelectedStep}
          onMoveStepUp={tourEditor.submitMoveSelectedStepUp}
          onMoveStepDown={tourEditor.submitMoveSelectedStepDown}
          onOverwriteStep={tourEditor.submitOverwriteSelectedStep}
          onSetCaption={tourEditor.submitSetCaption}
          onClose={tourEditor.close}
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
      {shareDialogOpen && (
        <ShareDialog
          mapId={mapId}
          mapTitle={mapName}
          shareSession={shareSession}
          shareSessionStatus={shareSessionStatus}
          localMeta={share.localMeta}
          listState={share.listState}
          shareList={share.shareList}
          lastIssuedLink={share.lastIssuedLink}
          notice={share.notice}
          noticeSequence={share.noticeSequence}
          busy={share.busy}
          onCreateShare={share.onCreateShare}
          onPublish={async () => {
            const blocked = resolveCollabEntryBlocked("publish", collab.collabSession);
            if (blocked !== null) {
              return { ok: false as const, reason: "collab-active" };
            }
            return share.onPublish();
          }}
          onCreateLink={share.onCreateLink}
          onCreateCommentLink={share.onCreateCommentLink}
          onCreateEditLink={share.onCreateEditLink}
          onRevokeLink={share.onRevokeLink}
          onReissueLink={share.onReissueLink}
          onDeleteShare={share.onDeleteShare}
          onLogin={onShareLogin}
          onClose={handleShareDialogClose}
          dialogMouseClickedAtRef={dialogMouseClickedAtRef}
        />
      )}
      {commentsDialog.open && (
        <MapCommentsDialog
          comments={comments}
          nodeLabelById={commentNodeLabelById}
          selectedNodeId={selectedNodeId}
          initialFilter={commentsDialog.initialFilter}
          shareSession={shareSession}
          shareSessionStatus={shareSessionStatus}
          onLogin={onShareLogin}
          onClose={commentsDialog.close}
          dialogMouseClickedAtRef={dialogMouseClickedAtRef}
        />
      )}
      <CollabPublishConfirmDialog
        open={collabPublishConfirmOpen}
        onDismiss={handleCollabPublishDismiss}
        onConfirm={handleCollabPublishConfirm}
        dialogMouseClickedAtRef={dialogMouseClickedAtRef}
      />
      {collab.notice ? (
        <div
          role="status"
          data-testid="collab-notice"
          data-notice-kind={collab.notice.kind}
          data-notice-sequence={collab.noticeSequence}
          className="sr-only"
        >
          {collab.notice.message}
        </div>
      ) : null}
    </>
  );
}
