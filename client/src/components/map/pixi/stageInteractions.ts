import type { Viewport } from "@/components/map/mapViewport";
import { createCanvasPanGesture } from "@/components/map/pixi/canvasPanGesture";
import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import { createPointerGestureSession } from "@/components/map/pixi/pointerGestureSession";
import { toPointerSample } from "@/components/map/pixi/pointerSample";
import { createTouchGestureCoordinator } from "@/components/map/pixi/touchGestureCoordinator";
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
  let activeBinding: StageBinding | null = null;
  const pointerGestures = createPointerGestureSession();

  const touchGestures = createTouchGestureCoordinator({
    viewportRef,
    onViewportChangeRef,
    onBeforePinch: () => {
      const bindingBeforeCancel = activeBinding;
      if (bindingBeforeCancel === null) return false;
      pointerGestures.cancel();
      return activeBinding === bindingBeforeCancel && !pointerGestures.hasActive();
    },
  });

  const cancelAllInteractions = () => {
    pointerGestures.cancel();
    touchGestures.cancel();
  };

  const hasActiveGesture = () => pointerGestures.hasActive() || touchGestures.hasActivePinch();

  const handleNodePointerDown = (nodeId: number, event: FederatedPointerEvent) => {
    if (event.button !== 0) return;
    const bindingAtEntry = activeBinding;
    if (
      bindingAtEntry === null
      || !event.composedPath().some((target: unknown) => target === bindingAtEntry.stage)
    ) {
      return;
    }

    const sample = toPointerSample(event, viewportRef.current);
    if (touchGestures.pointerDown(sample)) return;

    pointerGestures.cancel();
    if (
      pointerGestures.hasActive()
      || activeBinding !== bindingAtEntry
      || !nodesRef.current.some((node) => node.id === nodeId)
    ) {
      return;
    }

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

    const nextGesture = pointerGestures.start(sample.pointerId, gesture);
    if (!nextGesture) return;
    try {
      onSelectNodeRef.current(nodeId);
    } catch (error) {
      pointerGestures.clear(nextGesture);
      throw error;
    }
  };

  const handlePointerMove = (event: FederatedPointerEvent) => {
    const sample = toPointerSample(event, viewportRef.current);
    if (touchGestures.pointerMove(sample)) return;
    pointerGestures.move(sample);
  };

  const bind = (stage: InteractiveStage) => {
    if (activeBinding !== null) {
      throw new Error("Stage interactions are already bound");
    }
    const binding = { stage };
    activeBinding = binding;

    const handleStagePointerDown = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding || event.target !== stage || event.button !== 0) return;

      const sample = toPointerSample(event, viewportRef.current);
      if (touchGestures.pointerDown(sample)) return;

      const gestureAtEntry = pointerGestures.current();
      if (gestureAtEntry !== null && event.pointerId !== gestureAtEntry.pointerId) return;
      try {
        onSelectNodeRef.current(null);
      } finally {
        if (
          gestureAtEntry !== null
          && pointerGestures.current() === gestureAtEntry
          && activeBinding === binding
          && event.pointerId === gestureAtEntry.pointerId
        ) {
          pointerGestures.cancel();
        }
      }
      if (activeBinding !== binding || pointerGestures.hasActive()) return;

      pointerGestures.start(
        sample.pointerId,
        createCanvasPanGesture({
          startSample: sample,
          startViewport: viewportRef.current,
          onViewportChangeRef,
          dragThreshold,
        }),
      );
    };
    const handlePointerUp = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding) return;
      const sample = toPointerSample(event, viewportRef.current);
      touchGestures.pointerUp(sample);
      pointerGestures.end(sample);
    };
    const handlePointerUpOutside = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding) return;
      const sample = toPointerSample(event, viewportRef.current);
      touchGestures.pointerUp(sample);
      if (pointerGestures.owns(event.pointerId)) pointerGestures.cancel();
    };
    const handlePointerCancel = (event: FederatedPointerEvent) => {
      if (activeBinding !== binding) return;
      const sample = toPointerSample(event, viewportRef.current);
      touchGestures.pointerUp(sample);
      if (pointerGestures.owns(event.pointerId)) pointerGestures.cancel();
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

      let firstError: unknown;
      let hasError = false;
      const attemptCleanup = (cleanup: () => void) => {
        try {
          cleanup();
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      };

      attemptCleanup(() => { stage.off("pointerdown", handleStagePointerDown); });
      attemptCleanup(() => { stage.off("pointermove", handleStagePointerMove); });
      attemptCleanup(() => { stage.off("pointerup", handlePointerUp); });
      attemptCleanup(() => { stage.off("pointerupoutside", handlePointerUpOutside); });
      attemptCleanup(() => { stage.off("pointercancel", handlePointerCancel); });
      if (ownsBinding) {
        attemptCleanup(pointerGestures.cancel);
        attemptCleanup(touchGestures.reset);
      }
      if (hasError) throw firstError;
    };
  };

  return { bind, handleNodePointerDown, cancelActiveGesture: cancelAllInteractions, hasActiveGesture };
}
