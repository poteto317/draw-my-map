"use client";

import { useMemo, useRef, type MouseEvent } from "react";
import { NodeContextMenu } from "@/components/map/NodeContextMenu";
import { clampNodeContextMenuPosition } from "@/components/map/nodeContextMenuLayout";
import { resolveNodeContextMenuTarget } from "@/components/map/nodeContextMenuTarget";
import { useNodeContextMenu } from "@/components/map/useNodeContextMenu";
import { NodeLabelEditor } from "@/components/map/NodeLabelEditor";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const runtime = usePixiApplication(containerRef);
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
    const container = containerRef.current;
    if (!container) return;

    const action = resolveMapDoubleClickAction({
      client: { x: event.clientX, y: event.clientY },
      bounds: container.getBoundingClientRect(),
      viewport: viewportRef.current,
      nodes: nodes.filter((node) => effectiveVisibleNodeIds.has(node.id)),
    });
    if (action === null) return;

    if (action.type === "edit") editing.startEditing(action.nodeId);
    else onDoubleClick(action.point.x, action.point.y);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.target instanceof Element && event.target.closest('[role="menu"]')) return;
    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const target = resolveNodeContextMenuTarget({
      client: { x: event.clientX, y: event.clientY },
      bounds,
      viewport: viewportRef.current,
      nodes: nodes.filter((node) => effectiveVisibleNodeIds.has(node.id)),
    });
    if (target === null) {
      contextMenu.close();
      return;
    }

    onSelectNode(target.nodeId);
    if (onGenerateIllustration === undefined) return;
    contextMenu.open({
      nodeId: target.nodeId,
      position: clampNodeContextMenuPosition(target.anchor, bounds),
    });
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
            contextMenu.close();
            onGenerateIllustration(menu.nodeId);
          }}
        />
      )}
    </div>
  );
}
