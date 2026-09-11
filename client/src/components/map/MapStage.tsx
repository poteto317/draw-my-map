"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { NodeLabelEditor } from "@/components/map/NodeLabelEditor";
import { resolveMapDoubleClickAction } from "@/components/map/mapDoubleClickAction";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import { renderMapScene } from "@/components/map/pixi/renderMapScene";
import { usePixiApplication } from "@/components/map/pixi/usePixiApplication";
import { useMapStageInteractions } from "@/components/map/useMapStageInteractions";
import { useMapViewport } from "@/components/map/useMapViewport";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";
import { useNodeEditing } from "@/components/map/useNodeEditing";
import { useNodeKeyboardShortcuts } from "@/components/map/useNodeKeyboardShortcuts";
import type { Node } from "@/types/node";
import type { Container } from "pixi.js";

type MapStageProps = {
  nodes: Node[];
  selectedNodeId: number | null;
  onDoubleClick: (x: number, y: number) => void;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onSelectNode: (id: number | null) => void;
  onUpdateLabel: (id: number, label: string) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
  onDeleteNode: (id: number) => void;
};

export function MapStage({
  nodes,
  selectedNodeId,
  onDoubleClick,
  onAddChildNode,
  onAddSiblingNode,
  onSelectNode,
  onUpdateLabel,
  onMoveNode,
  onConnectNodes,
  onDeleteNode,
}: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldContainerRef = useRef<Container | null>(null);
  const runtime = usePixiApplication(containerRef);
  const editing = useNodeEditing(nodes, onUpdateLabel);
  const {
    viewport,
    viewportRef,
    setViewport,
    zoomAt,
    focusNode,
  } = useMapViewport();
  const {
    connectionTargetNodeId,
    onNodePointerDown,
    cancelActiveGesture,
    hasActiveGesture,
  } = useMapStageInteractions({
    runtime,
    nodes,
    viewportRef,
    onViewportChange: setViewport,
    onSelectNode,
    onMoveNode,
    onConnectNodes,
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

  useEffect(() => {
    if (!runtime) return;

    const worldContainer = renderMapScene(runtime.app, runtime.constructors, {
      nodes,
      selectedNodeId,
      editingNodeId: editing.editingNodeId,
      connectionTargetNodeId,
      onNodePointerDown,
      viewport: viewportRef.current,
    });
    worldContainerRef.current = worldContainer;

    return () => {
      if (worldContainerRef.current === worldContainer) worldContainerRef.current = null;
    };
  }, [
    runtime,
    nodes,
    selectedNodeId,
    editing.editingNodeId,
    connectionTargetNodeId,
    onNodePointerDown,
    viewportRef,
  ]);

  useEffect(() => {
    const worldContainer = worldContainerRef.current;
    if (worldContainer) applyViewportTransform(worldContainer, viewport);
  }, [viewport]);

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
      nodes,
    });
    if (action.type === "edit") editing.startEditing(action.nodeId);
    else onDoubleClick(action.point.x, action.point.y);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-crosshair"
      onDoubleClick={handleDoubleClick}
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
    </div>
  );
}
