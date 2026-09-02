import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent } from "pixi.js";

export type LatestValue<T> = {
  readonly current: T;
};

type StageInteractionOptions = {
  nodesRef: LatestValue<readonly Node[]>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  dragThreshold?: number;
};

type DragState = {
  nodeId: number;
  startX: number;
  startY: number;
  nodeStartX: number;
  nodeStartY: number;
  dragging: boolean;
};

type InteractiveStage = Pick<Container, "on" | "off">;

export function createStageInteractions({
  nodesRef,
  onSelectNodeRef,
  onMoveNodeRef,
  dragThreshold = 4,
}: StageInteractionOptions) {
  let dragState: DragState | null = null;

  const handleNodePointerDown = (nodeId: number, event: FederatedPointerEvent) => {
    dragState = null;
    onSelectNodeRef.current(nodeId);

    const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
    if (!node) return;

    dragState = {
      nodeId,
      startX: event.globalX,
      startY: event.globalY,
      nodeStartX: node.x,
      nodeStartY: node.y,
      dragging: false,
    };
  };

  const handlePointerMove = (event: FederatedPointerEvent) => {
    if (!dragState) return;

    const dx = event.globalX - dragState.startX;
    const dy = event.globalY - dragState.startY;
    if (!dragState.dragging) {
      if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
      dragState.dragging = true;
    }

    onMoveNodeRef.current(
      dragState.nodeId,
      dragState.nodeStartX + dx,
      dragState.nodeStartY + dy,
    );
  };

  const handlePointerUp = () => {
    dragState = null;
  };

  const bind = (stage: InteractiveStage) => {
    const handleStagePointerDown = (event: FederatedPointerEvent) => {
      if (event.target === stage) onSelectNodeRef.current(null);
    };

    stage.on("pointerdown", handleStagePointerDown);
    stage.on("pointermove", handlePointerMove);
    stage.on("pointerup", handlePointerUp);
    stage.on("pointerupoutside", handlePointerUp);

    return () => {
      stage.off("pointerdown", handleStagePointerDown);
      stage.off("pointermove", handlePointerMove);
      stage.off("pointerup", handlePointerUp);
      stage.off("pointerupoutside", handlePointerUp);
    };
  };

  return { bind, handleNodePointerDown };
}
