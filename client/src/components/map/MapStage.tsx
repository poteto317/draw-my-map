"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { NodeLabelEditor } from "@/components/map/NodeLabelEditor";
import { findNodeAtPoint, toLocalPoint } from "@/components/map/mapGeometry";
import { screenToWorld } from "@/components/map/mapViewport";
import { renderMapScene } from "@/components/map/pixi/renderMapScene";
import { usePixiApplication } from "@/components/map/pixi/usePixiApplication";
import { useMapStageInteractions } from "@/components/map/useMapStageInteractions";
import { useMapViewport } from "@/components/map/useMapViewport";
import { useNodeEditing } from "@/components/map/useNodeEditing";
import { useNodeKeyboardShortcuts } from "@/components/map/useNodeKeyboardShortcuts";
import type { Node } from "@/types/node";

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
  const runtime = usePixiApplication(containerRef);
  const editing = useNodeEditing(nodes, onUpdateLabel);
  const {
    viewport,
    viewportRef,
    setViewport,
  } = useMapViewport();
  const { connectionTargetNodeId, onNodePointerDown } = useMapStageInteractions({
    runtime,
    nodes,
    viewportRef,
    onViewportChange: setViewport,
    onSelectNode,
    onMoveNode,
    onConnectNodes,
  });

  useEffect(() => {
    if (!runtime) return;

    renderMapScene(runtime.app, runtime.constructors, {
      nodes,
      selectedNodeId,
      editingNodeId: editing.editingNodeId,
      connectionTargetNodeId,
      onNodePointerDown,
      viewport,
    });
  }, [
    runtime,
    nodes,
    selectedNodeId,
    editing.editingNodeId,
    connectionTargetNodeId,
    onNodePointerDown,
    viewport,
  ]);

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

    const screenPoint = toLocalPoint(
      event.clientX,
      event.clientY,
      container.getBoundingClientRect(),
    );
    const worldPoint = screenToWorld(screenPoint, viewportRef.current);
    const clickedNode = findNodeAtPoint(nodes, worldPoint);
    if (clickedNode) editing.startEditing(clickedNode.id);
    else onDoubleClick(worldPoint.x, worldPoint.y);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-crosshair"
      style={{ minHeight: "calc(100vh - 52px)" }}
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
