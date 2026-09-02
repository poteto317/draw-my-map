"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { NodeLabelEditor } from "@/components/map/NodeLabelEditor";
import { findNodeAtPoint, toLocalPoint } from "@/components/map/mapGeometry";
import { renderMapScene } from "@/components/map/pixi/renderMapScene";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import { usePixiApplication } from "@/components/map/pixi/usePixiApplication";
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
  onDeleteNode,
}: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtime = usePixiApplication(containerRef);
  const editing = useNodeEditing(nodes, onUpdateLabel);

  const nodesRef = useRef<readonly Node[]>(nodes);
  nodesRef.current = nodes;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const onMoveNodeRef = useRef(onMoveNode);
  onMoveNodeRef.current = onMoveNode;

  const interactionsRef = useRef<ReturnType<typeof createStageInteractions> | null>(null);
  interactionsRef.current ??= createStageInteractions({
    nodesRef,
    onSelectNodeRef,
    onMoveNodeRef,
  });
  const interactions = interactionsRef.current;

  useEffect(() => {
    if (!runtime) return;

    runtime.app.stage.eventMode = "static";
    runtime.app.stage.hitArea = runtime.app.screen;
    return interactions.bind(runtime.app.stage);
  }, [runtime, interactions]);

  useEffect(() => {
    if (!runtime) return;

    renderMapScene(runtime.app, runtime.constructors, {
      nodes,
      selectedNodeId,
      editingNodeId: editing.editingNodeId,
      onNodePointerDown: interactions.handleNodePointerDown,
    });
  }, [runtime, nodes, selectedNodeId, editing.editingNodeId, interactions]);

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

    const point = toLocalPoint(
      event.clientX,
      event.clientY,
      container.getBoundingClientRect(),
    );
    const clickedNode = findNodeAtPoint(nodes, point);
    if (clickedNode) editing.startEditing(clickedNode.id);
    else onDoubleClick(point.x, point.y);
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
          value={editing.editingText}
          onChange={editing.setEditingText}
          onCommit={editing.commitEditing}
          onCancel={editing.cancelEditing}
        />
      )}
    </div>
  );
}
