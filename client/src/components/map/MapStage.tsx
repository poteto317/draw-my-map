"use client";

import { useLayoutEffect, useMemo, useRef, type MouseEvent, type RefObject } from "react";
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
import { useMapStageInteractions } from "@/components/map/useMapStageInteractions";
import { useMapVisibilityTransition } from "@/components/map/useMapVisibilityTransition";
import { useMapStageReset } from "@/components/map/useMapStageReset";
import { useMapViewport } from "@/components/map/useMapViewport";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";
import { useNodeEditing } from "@/components/map/useNodeEditing";
import { useNodeKeyboardShortcuts } from "@/components/map/useNodeKeyboardShortcuts";
import { useNodeFocusRequest } from "@/components/map/useNodeFocusRequest";
import { useRenderedMapScene } from "@/components/map/useRenderedMapScene";
import { useSiblingReorderDragEscape } from "@/components/map/useSiblingReorderDragEscape";
import { useSiblingReorderShortcut } from "@/components/map/useSiblingReorderShortcut";
import { useIllustrationTextures } from "@/components/map/useIllustrationTextures";
import { useViewportScaleNotification } from "@/components/map/useViewportScaleNotification";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type {
  SubtreeClipboardData,
  SubtreeClipboardResult,
} from "@/domain/clipboard/subtreeClipboardCodec";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { OperationNotice } from "@/types/operationNotice";
import type { NodeFocusRequest } from "@/types/nodeFocusRequest";

type MapStageProps = {
  nodes: readonly Node[];
  focusRequest: NodeFocusRequest | null;
  visibleNodeIds?: ReadonlySet<number>;
  onViewportScaleChange?: (scale: number) => void;
  resetRevision?: number;
  // 成功したUndo／Redoとマップ置換で増える。復元前の編集・ジェスチャー・メニューを閉じる
  documentRevision: number;
  selectedNodeId: number | null;
  onDoubleClick: (x: number, y: number) => void;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onSelectNode: (id: number | null) => void;
  onUpdateLabel: (id: number, label: string) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  // ドラッグの最初の有効な移動の直前に呼び、終了までの移動を1操作にまとめる
  onBeginNodeMove: () => MapHistoryGroupLease;
  onConnectNodes: (parentId: number, childId: number) => void;
  layoutMode: NodeLayoutMode;
  // ショートカットとドラッグの並べ替えの要求。結果の通知は呼び出し元が出す
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
  onDeleteNode: (id: number) => void;
  // copy/pasteイベントで呼ぶ。枝データの生成と挿入はHome側、結果の通知もHomeへ返す
  onCopySubtree: (sourceId: number) => SubtreeClipboardResult<string>;
  onPasteSubtree: (data: SubtreeClipboardData) => number | null;
  onClipboardNotice: (notice: OperationNotice) => void;
  onGenerateIllustration?: (nodeId: number) => void;
  // false の間（ダイアログ表示中など）は、キーボード・クリップボードのショートカットとメニューを閉じる操作を止める
  shortcutsEnabled: boolean;
  // 画面の外のダイアログで最後にマウスでクリックした時刻。ダイアログが1回目のクリックで閉じると、
  // ダブルクリックの2回目と dblclick がこのキャンバスへ届くので、メニューの項目と同じ時間窓で無視する
  dialogMouseClickedAtRef: RefObject<number | null>;
};

export function MapStage({
  nodes,
  focusRequest,
  visibleNodeIds,
  onViewportScaleChange,
  resetRevision = 0,
  documentRevision,
  selectedNodeId,
  onDoubleClick,
  onAddChildNode,
  onAddSiblingNode,
  onSelectNode,
  onUpdateLabel,
  onMoveNode,
  onBeginNodeMove,
  onConnectNodes,
  layoutMode,
  onReorderSibling,
  onDeleteNode,
  onCopySubtree,
  onPasteSubtree,
  onClipboardNotice,
  onGenerateIllustration,
  shortcutsEnabled,
  dialogMouseClickedAtRef,
}: MapStageProps) {
  const effectiveVisibleNodeIds = useMemo(
    () => visibleNodeIds ?? new Set(nodes.map((node) => node.id)),
    [nodes, visibleNodeIds],
  );
  const visibleNodes = useMemo(
    () => nodes.filter((node) => effectiveVisibleNodeIds.has(node.id)),
    [nodes, effectiveVisibleNodeIds],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const menuActivatedAtRef = useRef<number | null>(null);
  const runtime = usePixiApplication(containerRef);
  const illustrationTextures = useIllustrationTextures(runtime, nodes);
  const editing = useNodeEditing(nodes, onUpdateLabel);
  const cancelEditing = editing.cancelEditing;
  const {
    viewport,
    viewportRef,
    setViewport,
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
  const {
    connectionTargetNodeId,
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
    onMoveNode,
    onBeginNodeMove,
    onConnectNodes,
    layoutMode,
    onReorderSibling,
  });

  const scene = useRenderedMapScene({
    runtime,
    options: {
      nodes,
      selectedNodeId,
      editingNodeId: editing.editingNodeId,
      connectionTargetNodeId,
      siblingReorderSourceNodeId: siblingReorderPreview?.nodeId ?? null,
      siblingReorderIndicator: siblingReorderPreview?.indicator ?? null,
      createNodePointerDownHandler,
      visibleNodeIds: effectiveVisibleNodeIds,
      illustrationTextures,
    },
    viewport,
    viewportRef,
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

  useHiddenNodeInteractionReset({
    selectedNodeId,
    editingNodeId: editing.editingNodeId,
    visibleNodeIds: effectiveVisibleNodeIds,
    onSelectNode,
    cancelEditing,
    cancelActiveGesture,
  });

  useMapWheelZoom({
    runtime,
    viewportRef,
    onBeforeZoom: cancelActiveGesture,
    onZoomAt: zoomAt,
  });

  useMapViewportShortcut({
    nodes,
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    enabled: shortcutsEnabled,
    screen: runtime ? runtime.app.screen : null,
    hasActiveGesture,
    onFocusNode: focusNode,
  });

  useNodeFocusRequest({
    request: focusRequest,
    documentRevision,
    nodes,
    screen: runtime ? runtime.app.screen : null,
    hasActiveGesture,
    cancelActiveGesture,
    onFocusNode: focusNode,
  });

  useViewportScaleNotification(viewport.scale, onViewportScaleChange);

  useNodeKeyboardShortcuts({
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    onAddChildNode,
    onAddSiblingNode,
    onDeleteNode,
    onStartEditing: editing.startEditing,
    enabled: shortcutsEnabled,
  });

  useSiblingReorderShortcut({
    selectedNodeId,
    isEditing: editing.editingNodeId !== null,
    hasActiveGesture,
    enabled: shortcutsEnabled,
    onReorderSibling,
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
    // The 2nd click of a double-click on a menu item or a dialog button lands on the canvas after
    // the overlay closed. Date.now() is read only after such an activation so normal double-clicks stay clock-neutral.
    const activatedAt = menuActivatedAtRef.current;
    if (activatedAt !== null && isDoubleClickFromOverlayActivation(activatedAt, Date.now())) return;
    // Dialog case: the 1st click closed the dialog (switch, create, delete, close).
    const dialogClickedAt = dialogMouseClickedAtRef.current ?? null;
    if (dialogClickedAt !== null && isDoubleClickFromOverlayActivation(dialogClickedAt, Date.now())) return;
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
        canOpenMenu: onGenerateIllustration !== undefined,
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
      onSelectNode(action.nodeId);
      contextMenu.open({ nodeId: action.nodeId, position: action.position });
    }
  };

  const menu = contextMenu.menu;
  const menuNode = menu === null ? undefined : nodes.find((node) => node.id === menu.nodeId);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-crosshair"
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
      {menu && onGenerateIllustration && (
        <NodeContextMenu
          position={menu.position}
          hasIllustration={menuNode?.illustration !== undefined}
          onGenerateIllustration={() => {
            menuActivatedAtRef.current = Date.now();
            contextMenu.close();
            onGenerateIllustration(menu.nodeId);
          }}
        />
      )}
    </div>
  );
}
