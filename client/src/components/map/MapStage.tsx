"use client";

import { useMemo, useRef, type MouseEvent } from "react";
import { NodeContextMenu } from "@/components/map/NodeContextMenu";
import {
  resolveMapContextMenuAction,
  type MapContextMenuAction,
} from "@/components/map/mapContextMenuAction";
import { isInsideNodeContextMenu } from "@/components/map/nodeContextMenuDom";
import { isTextEntryTarget } from "@/components/map/textEntryTarget";
import { useNodeContextMenu } from "@/components/map/useNodeContextMenu";
import { NodeLabelEditor } from "@/components/map/NodeLabelEditor";
import { isDoubleClickFromMenuActivation } from "@/components/map/menuActivationDoubleClick";
import { resolveMapDoubleClickAction } from "@/components/map/mapDoubleClickAction";
import { usePixiApplication } from "@/components/map/pixi/usePixiApplication";
import { useHiddenNodeInteractionReset } from "@/components/map/useHiddenNodeInteractionReset";
import { useMapStageInteractions } from "@/components/map/useMapStageInteractions";
import { useMapVisibilityTransition } from "@/components/map/useMapVisibilityTransition";
import { useMapStageReset } from "@/components/map/useMapStageReset";
import { useMapViewport } from "@/components/map/useMapViewport";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";
import { useNodeEditing } from "@/components/map/useNodeEditing";
import { useNodeKeyboardShortcuts } from "@/components/map/useNodeKeyboardShortcuts";
import { useRenderedMapScene } from "@/components/map/useRenderedMapScene";
import { useIllustrationTextures } from "@/components/map/useIllustrationTextures";
import { useViewportScaleNotification } from "@/components/map/useViewportScaleNotification";
import type { Node } from "@/types/node";

type MapStageProps = {
  nodes: Node[];
  visibleNodeIds?: ReadonlySet<number>;
  onViewportScaleChange?: (scale: number) => void;
  resetRevision?: number;
  selectedNodeId: number | null;
  onDoubleClick: (x: number, y: number) => void;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onSelectNode: (id: number | null) => void;
  onUpdateLabel: (id: number, label: string) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
  onDeleteNode: (id: number) => void;
  onGenerateIllustration?: (nodeId: number) => void;
};

export function MapStage({
  nodes,
  visibleNodeIds,
  onViewportScaleChange,
  resetRevision = 0,
  selectedNodeId,
  onDoubleClick,
  onAddChildNode,
  onAddSiblingNode,
  onSelectNode,
  onUpdateLabel,
  onMoveNode,
  onConnectNodes,
  onDeleteNode,
  onGenerateIllustration,
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
  });
  const {
    connectionTargetNodeId,
    createNodePointerDownHandler,
    cancelActiveGesture,
    hasActiveGesture,
  } = useMapStageInteractions({
    runtime,
    nodes,
    visibleNodeIds: effectiveVisibleNodeIds,
    viewportRef,
    onViewportChange: setViewport,
    onSelectNode,
    onMoveNode,
    onConnectNodes,
  });

  const scene = useRenderedMapScene({
    runtime,
    options: {
      nodes,
      selectedNodeId,
      editingNodeId: editing.editingNodeId,
      connectionTargetNodeId,
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
    screen: runtime ? runtime.app.screen : null,
    hasActiveGesture,
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
  });

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    // The 2nd click of a double-click on the menu item lands on the canvas after the menu closed.
    // Date.now() is read only after a menu activation so normal double-clicks stay clock-neutral.
    const activatedAt = menuActivatedAtRef.current;
    if (activatedAt !== null && isDoubleClickFromMenuActivation(activatedAt, Date.now())) return;
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
