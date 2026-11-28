"use client";

import type { TaskProgress } from "@/domain/nodes/nodeTaskProgress";
import type { LearnLabelDisplayContext } from "@/domain/map/mapLearnMode";
import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import { fitViewportToNodes, isValidScreenSize, type ScreenSize, type Viewport } from "@/components/map/mapViewport";
import { NodeContextMenu } from "@/components/map/NodeContextMenu";
import {
  resolveMapContextMenuAction,
  type MapContextMenuAction,
} from "@/components/map/mapContextMenuAction";
import { isInsideNodeContextMenu } from "@/components/map/nodeContextMenuDom";
import { isTextEntryTarget } from "@/components/map/textEntryTarget";
import { useNodeContextMenu } from "@/components/map/useNodeContextMenu";
import { NodeLabelEditor } from "@/components/map/NodeLabelEditor";
import { isDoubleClickFromOverlayActivation } from "@/components/map/menuActivationDoubleClick";
import { resolveMapDoubleClickAction } from "@/components/map/mapDoubleClickAction";
import { usePixiApplication } from "@/components/map/pixi/usePixiApplication";
import { useHiddenNodeInteractionReset } from "@/components/map/useHiddenNodeInteractionReset";
import { useDocumentRestoreInteractionReset } from "@/components/map/useDocumentRestoreInteractionReset";
import { useMapClipboardEvents } from "@/components/map/useMapClipboardEvents";
import {
  useMapStageInteractions,
  type TouchLongPressContextRequest,
} from "@/components/map/useMapStageInteractions";
import { useMapVisibilityTransition } from "@/components/map/useMapVisibilityTransition";
import { useMapStageReset } from "@/components/map/useMapStageReset";
import { useMapViewport } from "@/components/map/useMapViewport";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";
import { DEFAULT_WHEEL_ZOOM_SENSITIVITY } from "@/domain/uiPrefs/uiPrefs";
import { useNodeEditing } from "@/components/map/useNodeEditing";
import { useNodeKeyboardShortcuts } from "@/components/map/useNodeKeyboardShortcuts";
import { useNodeFocusRequest } from "@/components/map/useNodeFocusRequest";
import { useRenderedMapScene } from "@/components/map/useRenderedMapScene";
import { useSiblingReorderDragEscape } from "@/components/map/useSiblingReorderDragEscape";
import { useSiblingReorderShortcut } from "@/components/map/useSiblingReorderShortcut";
import { useNodeIndentShortcut } from "@/components/map/useNodeIndentShortcut";
import { useNodeParentInsertionShortcut } from "@/components/map/useNodeParentInsertionShortcut";
import { useNodeLabelEditRequest } from "@/components/map/useNodeLabelEditRequest";
import { useIllustrationTextures } from "@/components/map/useIllustrationTextures";
import { useSnapGridOverlay } from "@/components/map/useSnapGridOverlay";
import { useViewportFrameNotification } from "@/components/map/useViewportFrameNotification";
import { useViewportScaleNotification } from "@/components/map/useViewportScaleNotification";
import type { ViewportFrame } from "@/components/map/useViewportFrameNotification";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type { NodeIndentDirection } from "@/domain/nodes/nodeIndent";
import type {
  SubtreeClipboardData,
  SubtreeClipboardResult,
} from "@/domain/clipboard/subtreeClipboardCodec";
import type { Node } from "@/types/node";
import { DEFAULT_LAYOUT_SNAP_PREFS, type LayoutSnapPrefs } from "@/domain/nodes/snapGrid";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { OperationNotice } from "@/types/operationNotice";
import type { NodeFocusRequest } from "@/types/nodeFocusRequest";
import type { NodeLabelEditRequest } from "@/types/nodeLabelEditRequest";
import {
  branchGroupMemberIds,
  resolveGroupDeleteAvailability,
} from "@/domain/map/mapGroupAvailability";
import { resolveMapRelationGroupContextMenus } from "@/domain/map/mapRelationGroupContextMenus";
import { resolveBranchLayoutContextMenu } from "@/domain/map/mapBranchLayoutAvailability";
import { resolveLayoutPinnedContextMenu } from "@/domain/map/mapLayoutPinnedAvailability";
import type { BranchLayout, BranchLayoutDirection } from "@/types/branchLayout";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { TreeDirection } from "@/types/treeDirection";
import { resolveRelationDeleteAvailability } from "@/domain/map/mapRelationAvailability";
import {
  selectedGroupId as readSelectedGroupId,
  selectedRelationId as readSelectedRelationId,
} from "@/domain/map/mapCanvasSelectionGuards";
import { resolveBranchExtractContextMenu } from "@/domain/nodes/nodeBranchExtractAvailability";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { PresenceVisibilityInput } from "@/domain/nodes/mapPresenceVisibility";

const EMPTY_SELECTED_NODE_IDS: readonly number[] = [];

export type MapStageViewportHandle = {
  getViewport: () => Viewport;
  getScreenSize: () => ScreenSize | null;
  applyViewport: (next: Viewport, beforeChange?: () => void) => boolean;
  fitNodes: (nodes: readonly Node[], beforeChange?: () => void) => boolean;
};

type MapStageProps = {
  learnDisplay: LearnLabelDisplayContext;
  taskProgress: ReadonlyMap<number, TaskProgress>;
  nodes: readonly Node[];
  focusRequest: NodeFocusRequest | null;
  canvasContainerRef?: RefObject<HTMLDivElement | null>;
  viewportHandleRef?: RefObject<MapStageViewportHandle | null>;
  onBeforeCenterNode?: (request: NodeFocusRequest | null) => void;
  isCurrentFocusRequest?: (request: NodeFocusRequest) => boolean;
  onFocusRequestApplied?: (request: NodeFocusRequest) => void;
  onFocusRequestDiscarded?: (request: NodeFocusRequest) => void;
  visibleNodeIds?: ReadonlySet<number>;
  /**
   * 存在マーカー用。省略時はマーカー層スキップ（L-002）。
   * display 集合は visibleNodeIds を使う。
   */
  presenceVisibility?: PresenceVisibilityInput | null;
  /** 一時強調対象。空集合 = 強調オフ。省略不可（L-060） */
  highlightNodeIds: ReadonlySet<number>;
  /** ピン済みノード。空集合 = 印なし */
  pinnedNodeIds: ReadonlySet<number>;
  /** 未解決コメントスレッド数。0 のノードはキーを持たない。空 Map = 印なし。省略不可（L-060） */
  commentNodeCounts: ReadonlyMap<number, number>;
  onViewportScaleChange?: (scale: number) => void;
  /** ミニマップ等へ viewport + 画面サイズを伝える（L-060） */
  onViewportFrameChange?: (frame: ViewportFrame) => void;
  resetRevision?: number;
  // 成功したUndo／Redoとマップ置換で増える。復元前の編集・ジェスチャー・メニューを閉じる
  documentRevision: number;
  selectedNodeId: number | null;
  selectedNodeIds?: readonly number[];
  onDoubleClick: (x: number, y: number) => void;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onSelectNode: (id: number | null) => void;
  onToggleNodeSelection?: (id: number) => void;
  /** Shift範囲: 現在の選択へ加算（置換ではない）。`useNodes.selectNodeRange` と同じ契約。 */
  onSelectNodeRange?: (targetId: number, visibleNodeIdsOrdered: readonly number[]) => void;
  onSetSelectionFromMarquee?: (args: { mode: "replace" | "add"; ids: readonly number[] }) => void;
  onClearSelection?: () => void;
  pruneSelectionToVisible?: (visibleNodeIds: ReadonlySet<number>) => void;
  onUpdateLabel: (id: number, label: string) => boolean;
  onMoveNode: (id: number, x: number, y: number) => void;
  // ドラッグの最初の有効な移動の直前に呼び、終了までの移動を1操作にまとめる
  onBeginNodeMove: () => MapHistoryGroupLease;
  /** auto+ピンの座標ドラッグ（当該ノードのみ） */
  onMovePinnedNode?: (id: number, x: number, y: number) => void;
  /** ピンドラッグ終了時の再配置 */
  onFinalizePinnedNodeMove?: () => boolean;
  /** N5: 位置固定の切替 */
  onSetNodeLayoutPinned?: (nodeId: number, pinned: boolean) => void;
  /** N4: 枝方向。null＝文書の既定に戻す */
  onSetBranchLayout?: (nodeId: number, direction: BranchLayoutDirection | null) => void;
  layoutStyle?: LayoutStyle;
  branchLayouts?: readonly BranchLayout[];
  treeDirection?: TreeDirection;
  onConnectNodes: (parentId: number, childId: number) => void;
  layoutMode: NodeLayoutMode;
  // ショートカットとドラッグの並べ替えの要求。結果の通知は呼び出し元が出す
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
  // ショートカットの上げ下げの要求。結果の通知と展開は呼び出し元が行う
  onChangeNodeIndent: (nodeId: number, direction: NodeIndentDirection) => void;
  // ショートカットの親の挿入の要求。結果の通知とラベルの編集の要求は呼び出し元が行う
  onInsertParentNode: (nodeId: number) => void;
  // 呼び出し元からのラベルの編集の要求（親の挿入の後）。documentRevision が違う要求は無視する
  labelEditRequest: NodeLabelEditRequest | null;
  onDeleteNode: (id: number) => void;
  // copy/pasteイベントで呼ぶ。枝データの生成と挿入はHome側、結果の通知もHomeへ返す
  onCopySubtree: (sourceId: number) => SubtreeClipboardResult<string>;
  onPasteSubtree: (data: SubtreeClipboardData) => number | null;
  onClipboardNotice: (notice: OperationNotice) => void;
  onGenerateIllustration?: (nodeId: number) => void;
  onBeginBranchExtract?: () => void;
  relations?: readonly MapRelation[];
  groups?: readonly MapGroup[];
  canvasSelection?: MapCanvasSelection;
  onSelectRelation?: (relationId: number) => void;
  onDeleteRelation?: (relationId: number) => void;
  onBeginRelationAdd?: (fromId: number) => void;
  onConnectRelation?: (fromId: number, toId: number) => void;
  onSelectGroup?: (groupId: number) => void;
  onDeleteGroup?: (groupId: number) => void;
  onCreateGroup?: (nodeIds: readonly number[]) => void;
  isProtectedMode?: boolean;
  hasMapConflict?: boolean;
  isExternallyDeleted?: boolean;
  // false の間（ダイアログ表示中など）は、キーボード・クリップボードのショートカットとメニューを閉じる操作を止める
  shortcutsEnabled: boolean;
  wheelZoomSensitivity?: number;
  layoutSnapPrefs?: LayoutSnapPrefs;
  // 画面の外のダイアログで最後にマウスでクリックした時刻。ダイアログが1回目のクリックで閉じると、
  // ダブルクリックの2回目と dblclick がこのキャンバスへ届くので、メニューの項目と同じ時間窓で無視する
  dialogMouseClickedAtRef: RefObject<number | null>;
};

export function MapStage({
  learnDisplay,
  taskProgress,
  nodes,
  focusRequest,
  canvasContainerRef,
  viewportHandleRef,
  onBeforeCenterNode,
  isCurrentFocusRequest,
  onFocusRequestApplied,
  onFocusRequestDiscarded,
  visibleNodeIds,
  presenceVisibility = null,
  highlightNodeIds,
  pinnedNodeIds,
  commentNodeCounts,
  onViewportScaleChange,
  onViewportFrameChange,
  resetRevision = 0,
  documentRevision,
  selectedNodeId,
  selectedNodeIds,
  onDoubleClick,
  onAddChildNode,
  onAddSiblingNode,
  onSelectNode,
  onToggleNodeSelection,
  onSelectNodeRange,
  onSetSelectionFromMarquee,
  onClearSelection,
  pruneSelectionToVisible,
  onUpdateLabel,
  onMoveNode,
  onBeginNodeMove,
  onMovePinnedNode,
  onFinalizePinnedNodeMove,
  onSetNodeLayoutPinned,
  onSetBranchLayout,
  layoutStyle,
  branchLayouts,
  treeDirection,
  onConnectNodes,
  layoutMode,
  onReorderSibling,
  onChangeNodeIndent,
  onInsertParentNode,
  labelEditRequest,
  onDeleteNode,
  onCopySubtree,
  onPasteSubtree,
  onClipboardNotice,
  onGenerateIllustration,
  onBeginBranchExtract,
  relations,
  groups,
  canvasSelection,
  onSelectRelation,
  onDeleteRelation,
  onBeginRelationAdd,
  onConnectRelation,
  onSelectGroup,
  onDeleteGroup,
  onCreateGroup,
  isProtectedMode = false,
  hasMapConflict = false,
  isExternallyDeleted = false,
  shortcutsEnabled,
  wheelZoomSensitivity = DEFAULT_WHEEL_ZOOM_SENSITIVITY,
  layoutSnapPrefs = { ...DEFAULT_LAYOUT_SNAP_PREFS, enabled: false },
  dialogMouseClickedAtRef,
}: MapStageProps) {
  const selectedRelationId = readSelectedRelationId(canvasSelection);
  const selectedGroupId = readSelectedGroupId(canvasSelection);
  const effectiveVisibleNodeIds = useMemo(
    () => visibleNodeIds ?? new Set(nodes.map((node) => node.id)),
    [nodes, visibleNodeIds],
  );
  const visibleNodes = useMemo(
    () => nodes.filter((node) => effectiveVisibleNodeIds.has(node.id)),
    [nodes, effectiveVisibleNodeIds],
  );
  const localContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = canvasContainerRef ?? localContainerRef;
  const menuActivatedAtRef = useRef<number | null>(null);
  const [screenSize, setScreenSize] = useState<ScreenSize | null>(null);
  const runtime = usePixiApplication(containerRef, setScreenSize);
  // The 2nd press of a double-click on a menu item or a dialog button lands on the canvas after
  // the overlay closed. Date.now() is read only after such an activation so normal clicks stay clock-neutral.
  const isOverlayFollowUpClick = () => {
    const activatedAt = menuActivatedAtRef.current;
    if (activatedAt !== null && isDoubleClickFromOverlayActivation(activatedAt, Date.now())) return true;
    // Dialog case: the 1st click closed the dialog (switch, create, delete, close).
    const dialogClickedAt = dialogMouseClickedAtRef.current ?? null;
    return dialogClickedAt !== null && isDoubleClickFromOverlayActivation(dialogClickedAt, Date.now());
  };
  const illustrationTextures = useIllustrationTextures(runtime, nodes);
  const editing = useNodeEditing(nodes, onUpdateLabel);
  const cancelEditing = editing.cancelEditing;
  const {
    viewport,
    viewportRef,
    setViewport,
    panBy,
    zoomAt,
    focusNode,
  } = useMapViewport();
  const contextMenu = useNodeContextMenu({
    nodes,
    visibleNodeIds: effectiveVisibleNodeIds,
    resetRevision,
    viewport,
    shortcutsEnabled,
  });
  const resolvedOnClearSelection = onClearSelection ?? (() => onSelectNode(null));
  const touchLongPressContextMenuRef = useRef<(request: TouchLongPressContextRequest) => void>(() => {});

  const {
    connectionTargetNodeId,
    marqueeRect,
    siblingReorderPreview,
    createNodePointerDownHandler,
    cancelActiveGesture,
    hasActiveGesture,
    isSiblingReorderActive,
  } = useMapStageInteractions({
    runtime,
    nodes,
    visibleNodeIds: effectiveVisibleNodeIds,
    viewportRef,
    onViewportChange: setViewport,
    onSelectNode,
    onToggleNodeSelection,
    onSelectNodeRange,
    onSetSelectionFromMarquee,
    onClearSelection: resolvedOnClearSelection,
    onMoveNode,
    onBeginNodeMove,
    onMovePinnedNode,
    onFinalizePinnedNodeMove,
    onConnectNodes,
    layoutMode,
    onReorderSibling,
    layoutSnapPrefs: {
      enabled: layoutSnapPrefs.enabled,
      gridStep: layoutSnapPrefs.gridStep,
    },
    shouldIgnorePointerDown: isOverlayFollowUpClick,
    structureEditEnabled: shortcutsEnabled,
    onLongPressContextMenu: (request) => touchLongPressContextMenuRef.current(request),
  });

  const supersededFocusSequence = useRef<number | null>(null);
  const supersedePendingFocus = useCallback(() => {
    if (focusRequest !== null) {
      supersededFocusSequence.current = Math.max(supersededFocusSequence.current ?? 0, focusRequest.sequence);
    }
  }, [focusRequest]);
  const getScreenSize = useCallback((): ScreenSize | null => {
    if (!runtime || !isValidScreenSize(runtime.app.screen)) return null;
    const { width, height } = runtime.app.screen;
    return { width, height };
  }, [runtime]);
  const applyViewport = useCallback((next: Viewport, beforeChange?: () => void) => (
    getScreenSize() !== null && setViewport(next, () => {
      beforeChange?.();
      supersedePendingFocus();
      if (hasActiveGesture()) cancelActiveGesture();
    })
  ), [getScreenSize, setViewport, supersedePendingFocus, hasActiveGesture, cancelActiveGesture]);

  useImperativeHandle(viewportHandleRef, () => ({
    getViewport: () => viewportRef.current,
    getScreenSize,
    applyViewport,
    fitNodes: (targetNodes, beforeChange) => {
      const screen = getScreenSize();
      const next = screen === null ? null : fitViewportToNodes(targetNodes, screen);
      return next !== null && applyViewport(next, beforeChange);
    },
  }), [viewportRef, getScreenSize, applyViewport]);

  const resolvedSelectedNodeIds = useMemo(() => {
    if (selectedNodeIds !== undefined) return selectedNodeIds;
    if (selectedNodeId !== null) return [selectedNodeId];
    return EMPTY_SELECTED_NODE_IDS;
  }, [selectedNodeId, selectedNodeIds]);

  const handleRelationPointerDown = useCallback((relationId: number) => {
    // 関連線選択へ移るとき進行中のノードラベル編集を捨てる（L-061・確定拒否で黙って捨てない）
    cancelEditing();
    onSelectRelation?.(relationId);
  }, [cancelEditing, onSelectRelation]);

  const handleGroupPointerDown = useCallback((groupId: number) => {
    // グループ選択へ移るとき進行中のノードラベル編集を捨てる（L-061）
    cancelEditing();
    onSelectGroup?.(groupId);
  }, [cancelEditing, onSelectGroup]);

  const scene = useRenderedMapScene({
    runtime,
    options: {
      learnDisplay,
      taskProgress,
      nodes,
      selectedNodeIds: resolvedSelectedNodeIds,
      editingNodeId: editing.editingNodeId,
      connectionTargetNodeId,
      marqueeRect,
      siblingReorderSourceNodeId: siblingReorderPreview?.nodeId ?? null,
      siblingReorderIndicator: siblingReorderPreview?.indicator ?? null,
      createNodePointerDownHandler,
      visibleNodeIds: effectiveVisibleNodeIds,
      highlightNodeIds,
      pinnedNodeIds,
      commentNodeCounts,
      illustrationTextures,
      relations,
      selectedRelationId,
      onRelationPointerDown: handleRelationPointerDown,
      groups,
      selectedGroupId,
      onGroupPointerDown: handleGroupPointerDown,
    },
    presenceVisibility,
    viewport,
    viewportRef,
    screenSize,
  });

  useSnapGridOverlay({
    runtime,
    scene,
    viewport,
    screenSize,
    layoutMode,
    snapPrefs: layoutSnapPrefs,
  });

  useMapVisibilityTransition({
    scene,
    nodes,
    visibleNodeIds: effectiveVisibleNodeIds,
  });

  useMapStageReset({
    resetRevision,
    cancelEditing,
    cancelActiveGesture,
    setViewport,
  });

  useDocumentRestoreInteractionReset({
    documentRevision,
    cancelEditing,
    cancelActiveGesture,
    closeContextMenu: contextMenu.close,
  });

  // ダイアログを開く（shortcutsEnabled が false になる）と、進行中のドラッグを中止する。
  // キーボードや2本目の指でダイアログを開いても、タッチの暗黙のキャプチャで pointerup がキャンバスへ届くため
  useLayoutEffect(() => {
    if (!shortcutsEnabled) cancelActiveGesture();
  }, [shortcutsEnabled, cancelActiveGesture]);

  useSiblingReorderDragEscape({
    isSiblingReorderActive,
    cancelActiveGesture,
  });

  const resolvedPruneSelectionToVisible = pruneSelectionToVisible
    ?? ((visible: ReadonlySet<number>) => {
      if (selectedNodeId !== null && !visible.has(selectedNodeId)) onSelectNode(null);
    });

  useHiddenNodeInteractionReset({
    selectedNodeIds: resolvedSelectedNodeIds,
    selectedNodeId,
    editingNodeId: editing.editingNodeId,
    visibleNodeIds: effectiveVisibleNodeIds,
    pruneSelectionToVisible: resolvedPruneSelectionToVisible,
    cancelEditing,
    cancelActiveGesture,
  });

  useMapWheelZoom({
    runtime,
    viewportRef,
    wheelZoomSensitivity,
    onBeforeZoom: cancelActiveGesture,
    onPanBy: panBy,
    onZoomAt: zoomAt,
  });

  useMapViewportShortcut({
    nodes,
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    enabled: shortcutsEnabled,
    screen: runtime ? runtime.app.screen : null,
    hasActiveGesture,
    onFocusNode: (node, screen) => focusNode(node, screen, () => {
      onBeforeCenterNode?.(null);
      supersedePendingFocus();
    }),
  });

  useNodeFocusRequest({
    request: focusRequest,
    documentRevision,
    nodes,
    screen: screenSize,
    hasActiveGesture,
    cancelActiveGesture,
    isSuperseded: (sequence) => supersededFocusSequence.current !== null
      && sequence <= supersededFocusSequence.current,
    isCurrentRequest: isCurrentFocusRequest,
    onDiscard: onFocusRequestDiscarded,
    onFocusNode: (node, screen, request) => {
      if (isCurrentFocusRequest?.(request) === false) return;
      focusNode(node, screen, () => onBeforeCenterNode?.(request));
      onFocusRequestApplied?.(request);
    },
  });

  useNodeLabelEditRequest({
    request: labelEditRequest,
    documentRevision,
    nodes,
    hasActiveGesture,
    cancelActiveGesture,
    startEditing: editing.startEditing,
  });

  useViewportScaleNotification(viewport.scale, onViewportScaleChange);
  useViewportFrameNotification(viewport, screenSize, onViewportFrameChange);

  const handleDeleteRelation = useCallback((relationId: number) => {
    const relation = (relations ?? []).find((entry) => entry.id === relationId);
    const canDelete = resolveRelationDeleteAvailability({
      viewMode: "map",
      isProtectedMode,
      hasConflict: hasMapConflict,
      isExternallyDeleted,
      nodes,
      relation,
    }).enabled;
    if (canDelete) onDeleteRelation?.(relationId);
  }, [
    relations,
    isProtectedMode,
    hasMapConflict,
    isExternallyDeleted,
    nodes,
    onDeleteRelation,
  ]);

  const handleDeleteGroup = useCallback((groupId: number) => {
    const group = (groups ?? []).find((entry) => entry.id === groupId);
    const canDelete = resolveGroupDeleteAvailability({
      viewMode: "map",
      isProtectedMode,
      hasConflict: hasMapConflict,
      isExternallyDeleted,
      nodes,
      group,
    }).enabled;
    if (canDelete) onDeleteGroup?.(groupId);
  }, [
    groups,
    isProtectedMode,
    hasMapConflict,
    isExternallyDeleted,
    nodes,
    onDeleteGroup,
  ]);

  useNodeKeyboardShortcuts({
    selectedNodeId,
    selectedRelationId,
    selectedGroupId,
    isEditing: editing.editingNodeId !== null,
    onAddChildNode,
    onAddSiblingNode,
    onDeleteNode,
    onDeleteRelation: handleDeleteRelation,
    onDeleteGroup: handleDeleteGroup,
    onStartEditing: editing.startEditing,
    enabled: shortcutsEnabled,
    onClearSelection: resolvedOnClearSelection,
    isSiblingReorderActive,
    isContextMenuOpen: () => contextMenu.menu !== null,
  });

  useSiblingReorderShortcut({
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    hasActiveGesture,
    enabled: shortcutsEnabled,
    onReorderSibling,
  });

  useNodeIndentShortcut({
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    hasActiveGesture,
    enabled: shortcutsEnabled,
    onChangeNodeIndent,
  });

  useNodeParentInsertionShortcut({
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    hasActiveGesture,
    enabled: shortcutsEnabled,
    onInsertParentNode,
  });

  useMapClipboardEvents({
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    hasActiveGesture,
    copySubtree: onCopySubtree,
    pasteSubtree: onPasteSubtree,
    publishNotice: onClipboardNotice,
    enabled: shortcutsEnabled,
  });

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isOverlayFollowUpClick()) return;
    if (!shortcutsEnabled) return;
    // 関連線／グループ選択中はノードラベル編集・空キャンバス追加を始めない（L-061）
    if (selectedRelationId !== null || selectedGroupId !== null) return;
    const container = containerRef.current;
    if (!container) return;

    const action = resolveMapDoubleClickAction({
      client: { x: event.clientX, y: event.clientY },
      bounds: container.getBoundingClientRect(),
      viewport: viewportRef.current,
      nodes: visibleNodes,
    });
    if (action === null) return;

    if (action.type === "edit") editing.startEditing(action.nodeId);
    else onDoubleClick(action.point.x, action.point.y);
  };

  // The press would move focus off the control that the closed dialog just returned it to.
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (isOverlayFollowUpClick()) event.preventDefault();
  };

  // イラスト配線の有無に依存しない。関連線／グループ等いずれかの入口があればメニューを開ける
  const canOpenContextMenu = onGenerateIllustration !== undefined
    || onBeginBranchExtract !== undefined
    || onBeginRelationAdd !== undefined
    || onConnectRelation !== undefined
    || onCreateGroup !== undefined;

  const touchLongPressContextMenuHandler = useCallback((request: TouchLongPressContextRequest) => {
    if (isOverlayFollowUpClick()) return;
    const container = containerRef.current;
    if (container === null) return;

    const action: MapContextMenuAction = resolveMapContextMenuAction({
      isEditing: editing.editingNodeId !== null,
      isTextEntryTarget: false,
      isInsideMenu: false,
      hasActiveGesture: hasActiveGesture(),
      canOpenMenu: canOpenContextMenu && shortcutsEnabled,
      client: request.client,
      bounds: container.getBoundingClientRect(),
      viewport: viewportRef.current,
      visibleNodes,
      pointerType: "touch",
    });

    if (action.type === "dismiss") contextMenu.close();
    else if (action.type === "select") onSelectNode(action.nodeId);
    else if (action.type === "open") {
      if (!resolvedSelectedNodeIds.includes(action.nodeId)) {
        onSelectNode(action.nodeId);
      }
      contextMenu.open({ nodeId: action.nodeId, position: action.position });
    }
  }, [
    canOpenContextMenu,
    contextMenu,
    editing.editingNodeId,
    hasActiveGesture,
    onSelectNode,
    resolvedSelectedNodeIds,
    shortcutsEnabled,
    visibleNodes,
    viewportRef,
  ]);

  useLayoutEffect(() => {
    touchLongPressContextMenuRef.current = touchLongPressContextMenuHandler;
  }, [touchLongPressContextMenuHandler]);

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    // macOS Ctrl+click is a secondary click; the primary-button gesture it started is not a drag.
    if (event.ctrlKey && hasActiveGesture()) cancelActiveGesture();
    const container = containerRef.current;
    const action: MapContextMenuAction = container === null
      ? { type: "suppress" }
      : resolveMapContextMenuAction({
        isEditing: editing.editingNodeId !== null,
        isTextEntryTarget: isTextEntryTarget(event.target),
        isInsideMenu: isInsideNodeContextMenu(event.target),
        hasActiveGesture: hasActiveGesture(),
        canOpenMenu: canOpenContextMenu && shortcutsEnabled,
        client: { x: event.clientX, y: event.clientY },
        bounds: container.getBoundingClientRect(),
        viewport: viewportRef.current,
        visibleNodes,
      });

    if (action.type === "native") return;
    event.preventDefault();

    if (action.type === "dismiss") contextMenu.close();
    else if (action.type === "select") onSelectNode(action.nodeId);
    else if (action.type === "open") {
      // 複数選択中に選択済みノードを右クリックしても選択を畳み込まない（「関連線で結ぶ」用）
      if (!resolvedSelectedNodeIds.includes(action.nodeId)) {
        onSelectNode(action.nodeId);
      }
      contextMenu.open({ nodeId: action.nodeId, position: action.position });
    }
  };

  const menu = contextMenu.menu;
  const menuNode = menu === null ? undefined : nodes.find((node) => node.id === menu.nodeId);
  const guardInput = {
    viewMode: "map" as const,
    isProtectedMode,
    hasConflict: hasMapConflict,
    isExternallyDeleted,
  };
  const branchExtractMenu = menu === null
    ? { visible: false, disabled: false }
    : resolveBranchExtractContextMenu({
      ...guardInput,
      selectedNodeId,
      selectedNodeIds: resolvedSelectedNodeIds,
      nodes,
      contextMenuNodeId: menu.nodeId,
    });
  const {
    relationAdd: relationAddMenu,
    relationConnect: relationConnectMenu,
    groupCreate: groupCreateMenu,
    branchGroup: branchGroupMenu,
  } = resolveMapRelationGroupContextMenus({
    ...guardInput,
    menuNodeId: menu?.nodeId ?? null,
    selectedNodeId,
    selectedNodeIds: resolvedSelectedNodeIds,
    nodes,
    relations,
  });
  const layoutPinnedMenu = menu === null
    ? { visible: false, disabled: false, action: "pin" as const }
    : resolveLayoutPinnedContextMenu({
      ...guardInput,
      selectedNodeId,
      selectedNodeIds: resolvedSelectedNodeIds,
      contextMenuNodeId: menu.nodeId,
      nodes,
      canvasSelection,
    });
  const branchLayoutMenu = menu === null
    ? {
      visible: false,
      disabled: false,
      currentDirection: "lr" as const,
      hasExplicitEntry: false,
    }
    : resolveBranchLayoutContextMenu({
      ...guardInput,
      selectedNodeId,
      selectedNodeIds: resolvedSelectedNodeIds,
      contextMenuNodeId: menu.nodeId,
      nodes,
      canvasSelection,
      layoutStyle,
      branchLayouts,
      treeDirection,
    });

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      aria-label="マップキャンバス"
      className="relative h-full w-full cursor-crosshair"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {editing.editingNode && (
        <NodeLabelEditor
          node={editing.editingNode}
          viewport={viewport}
          value={editing.editingText}
          onChange={editing.setEditingText}
          onCommit={editing.commitEditing}
          onCancel={editing.cancelEditing}
        />
      )}
      {menu && canOpenContextMenu && (
        <NodeContextMenu
          position={menu.position}
          hasIllustration={menuNode?.illustration !== undefined}
          onGenerateIllustration={onGenerateIllustration === undefined
            ? undefined
            : () => {
              menuActivatedAtRef.current = Date.now();
              contextMenu.close();
              onGenerateIllustration(menu.nodeId);
            }}
          extractVisible={branchExtractMenu.visible}
          extractDisabled={branchExtractMenu.disabled}
          onBeginBranchExtract={onBeginBranchExtract === undefined ? undefined : () => {
            menuActivatedAtRef.current = Date.now();
            contextMenu.close();
            onBeginBranchExtract();
          }}
          relationAddVisible={relationAddMenu.visible}
          relationAddDisabled={relationAddMenu.disabled}
          onBeginRelationAdd={onBeginRelationAdd === undefined ? undefined : () => {
            menuActivatedAtRef.current = Date.now();
            contextMenu.close();
            onBeginRelationAdd(menu.nodeId);
          }}
          relationConnectVisible={relationConnectMenu.visible}
          relationConnectDisabled={relationConnectMenu.disabled}
          onConnectRelation={onConnectRelation === undefined || resolvedSelectedNodeIds.length !== 2
            ? undefined
            : () => {
              menuActivatedAtRef.current = Date.now();
              contextMenu.close();
              onConnectRelation(resolvedSelectedNodeIds[0]!, resolvedSelectedNodeIds[1]!);
            }}
          groupCreateVisible={groupCreateMenu.visible}
          groupCreateDisabled={groupCreateMenu.disabled}
          onCreateGroup={onCreateGroup === undefined || resolvedSelectedNodeIds.length < 2
            ? undefined
            : () => {
              menuActivatedAtRef.current = Date.now();
              contextMenu.close();
              onCreateGroup(resolvedSelectedNodeIds);
            }}
          branchGroupVisible={branchGroupMenu.visible}
          branchGroupDisabled={branchGroupMenu.disabled}
          onCreateBranchGroup={onCreateGroup === undefined || selectedNodeId === null
            ? undefined
            : () => {
              const memberIds = branchGroupMemberIds(nodes, selectedNodeId);
              if (memberIds === null) return;
              menuActivatedAtRef.current = Date.now();
              contextMenu.close();
              onCreateGroup(memberIds);
            }}
          layoutPinnedVisible={layoutPinnedMenu.visible}
          layoutPinnedDisabled={layoutPinnedMenu.disabled}
          layoutPinnedAction={layoutPinnedMenu.action}
          onToggleLayoutPinned={onSetNodeLayoutPinned === undefined || selectedNodeId === null
            ? undefined
            : () => {
              menuActivatedAtRef.current = Date.now();
              contextMenu.close();
              onSetNodeLayoutPinned(selectedNodeId, layoutPinnedMenu.action === "pin");
            }}
          branchLayoutVisible={branchLayoutMenu.visible}
          branchLayoutDisabled={branchLayoutMenu.disabled}
          branchLayoutCurrent={branchLayoutMenu.currentDirection}
          branchLayoutHasExplicit={branchLayoutMenu.hasExplicitEntry}
          onSetBranchLayout={onSetBranchLayout === undefined || selectedNodeId === null
            ? undefined
            : (direction) => {
              menuActivatedAtRef.current = Date.now();
              contextMenu.close();
              onSetBranchLayout(selectedNodeId, direction);
            }}
        />
      )}
    </div>
  );
}
