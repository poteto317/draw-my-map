import { screenToWorld } from "@/components/map/mapViewport";
import type { Viewport } from "@/components/map/mapViewport";
import { createCanvasPanGesture } from "@/components/map/pixi/canvasPanGesture";
import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent } from "pixi.js";

export type { LatestValue } from "@/components/map/pixi/pointerGesture";

type StageInteractionOptions = {
  nodesRef: LatestValue<readonly Node[]>;
  viewportRef: LatestValue<Viewport>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => void>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
  dragThreshold?: number;
};

type InteractiveStage = Pick<Container, "on" | "off">;

type StageBinding = {
  stage: InteractiveStage;
};

export function createStageInteractions({
  nodesRef,
  viewportRef,
  onSelectNodeRef,
  onMoveNodeRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  onViewportChangeRef,
  dragThreshold = 4,
}: StageInteractionOptions) {
  let activeGesture: { pointerId: number; gesture: PointerGesture } | null = null;
  let activeBinding: StageBinding | null = null;

  const toPointerSample = (event: FederatedPointerEvent): PointerSample => {
    const screen = { x: event.globalX, y: event.globalY };
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      screen,
      world: screenToWorld(screen, viewportRef.current),
    };
  };

  const cancelActiveGesture = () => {
    const gestureToCancel = activeGesture;
    activeGesture = null;
    gestureToCancel?.gesture.cancel();
  };

  const hasActiveGesture = () => activeGesture !== null;

  const handleNodePointerDown = (nodeId: number, event: FederatedPointerEvent) => {
    const bindingAtEntry = activeBinding;
    if (
      bindingAtEntry === null
      || !event.composedPath().some((target: unknown) => target === bindingAtEntry.stage)
    ) {
      return;
    }

    cancelActiveGesture();
    if (
      activeGesture !== null
      || activeBinding !== bindingAtEntry
      || !nodesRef.current.some((node) => node.id === nodeId)
    ) {
      return;
    }

    const sample = toPointerSample(event);
    const gesture = event.shiftKey
      ? createNodeConnectionGesture({
        sourceNodeId: nodeId,
        nodesRef,
        onConnectNodesRef,
        onConnectionTargetChangeRef,
      })
      : createNodeMoveGesture({
        nodeId,
        startSample: sample,
        nodesRef,
        onMoveNodeRef,
        dragThreshold,
      });
    if (!gesture) return;

    const nextGesture = { pointerId: sample.pointerId, gesture };
    activeGesture = nextGesture;
    try {
      onSelectNodeRef.current(nodeId);
    } catch (error) {
      if (activeGesture === nextGesture) activeGesture = null;
      throw error;
    }
  };

  const handlePointerMove = (event: FederatedPointerEvent) => {
    if (event.pointerId === activeGesture?.pointerId) {
      activeGesture.gesture.move(toPointerSample(event));
    }
  };

  const bind = (stage: InteractiveStage) => {
    if (activeBinding !== null) {
      throw new Error("Stage interactions are already bound");
    }
    const binding = { stage };
    activeBinding = binding;

    const handleStagePointerDown = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding || event.target !== stage) return;

      const gestureAtEntry = activeGesture;
      try {
        onSelectNodeRef.current(null);
      } finally {
        if (
          gestureAtEntry !== null
          && activeGesture === gestureAtEntry
          && activeBinding === binding
          && event.pointerId === gestureAtEntry.pointerId
        ) {
          cancelActiveGesture();
        }
      }
      if (activeBinding !== binding || activeGesture !== null) return;

      const sample = toPointerSample(event);
      activeGesture = {
        pointerId: sample.pointerId,
        gesture: createCanvasPanGesture({
          startSample: sample,
          startViewport: viewportRef.current,
          onViewportChangeRef,
          dragThreshold,
        }),
      };
    };
    const handlePointerUp = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding) return;
      if (event.pointerId !== activeGesture?.pointerId) return;

      const gestureToEnd = activeGesture;
      activeGesture = null;
      gestureToEnd.gesture.end(toPointerSample(event));
    };
    const handlePointerUpOutside = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding) return;
      if (event.pointerId === activeGesture?.pointerId) cancelActiveGesture();
    };
    const handlePointerCancel = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding) return;
      if (event.pointerId === activeGesture?.pointerId) cancelActiveGesture();
    };
    const handleStagePointerMove = (event: FederatedPointerEvent) => {
      if (activeBinding === binding) handlePointerMove(event);
    };

    stage.on("pointerdown", handleStagePointerDown);
    stage.on("pointermove", handleStagePointerMove);
    stage.on("pointerup", handlePointerUp);
    stage.on("pointerupoutside", handlePointerUpOutside);
    stage.on("pointercancel", handlePointerCancel);

    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      const ownsBinding = activeBinding === binding;
      if (ownsBinding) activeBinding = null;

      stage.off("pointerdown", handleStagePointerDown);
      stage.off("pointermove", handleStagePointerMove);
      stage.off("pointerup", handlePointerUp);
      stage.off("pointerupoutside", handlePointerUpOutside);
      stage.off("pointercancel", handlePointerCancel);
      if (ownsBinding) cancelActiveGesture();
    };
  };

  return { bind, handleNodePointerDown, cancelActiveGesture, hasActiveGesture };
}
