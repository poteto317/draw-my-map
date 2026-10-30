import type { Viewport } from "@/components/map/mapViewport";
import { createCanvasPanGesture } from "@/components/map/pixi/canvasPanGesture";
import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { createPointerGestureSession } from "@/components/map/pixi/pointerGestureSession";
import {
  hasFinitePointerCoordinates,
  toPointerSample,
} from "@/components/map/pixi/pointerSample";
import { createSiblingReorderGesture } from "@/components/map/pixi/siblingReorderGesture";
import { createTouchGestureCoordinator } from "@/components/map/pixi/touchGestureCoordinator";
import type { SiblingReorderPreview } from "@/components/map/siblingReorderDropSlot";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { Container, FederatedPointerEvent } from "pixi.js";

export type { LatestValue } from "@/components/map/pixi/pointerGesture";

type StageInteractionOptions = {
  nodesRef: LatestValue<readonly Node[]>;
  visibleNodeIdsRef?: LatestValue<ReadonlySet<number>>;
  viewportRef: LatestValue<Viewport>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  onBeginNodeMoveRef: LatestValue<() => MapHistoryGroupLease>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => void>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
  layoutModeRef: LatestValue<NodeLayoutMode>;
  onReorderSiblingRef: LatestValue<(nodeId: number, request: SiblingReorderRequest) => void>;
  onSiblingReorderPreviewChangeRef: LatestValue<(preview: SiblingReorderPreview | null) => void>;
  dragThreshold?: number;
};

type InteractiveStage = Pick<Container, "on" | "off">;

type StageBinding = {
  stage: InteractiveStage;
};

export function createStageInteractions({
  nodesRef,
  visibleNodeIdsRef,
  viewportRef,
  onSelectNodeRef,
  onMoveNodeRef,
  onBeginNodeMoveRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  onViewportChangeRef,
  layoutModeRef,
  onReorderSiblingRef,
  onSiblingReorderPreviewChangeRef,
  dragThreshold = 4,
}: StageInteractionOptions) {
  let activeBinding: StageBinding | null = null;
  const pointerGestures = createPointerGestureSession();
  // 省略時は全件が見えている扱い（resolveEffectiveVisibleNodeIds と同じ意味）
  const siblingReorderVisibleNodeIdsRef: LatestValue<ReadonlySet<number>> = visibleNodeIdsRef ?? {
    get current() {
      return new Set(nodesRef.current.map((node) => node.id));
    },
  };
  // 最後に作った並べ替えのジェスチャー。進行中かどうかを pointerGestures の現在の lease と比べて判定する
  let siblingReorderGesture: PointerGesture | null = null;

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
    touchGestures.cancel();
    pointerGestures.cancel();
  };

  const hasActiveGesture = () => pointerGestures.hasActive() || touchGestures.hasActivePinch();

  const isSiblingReorderActive = () => {
    const lease = pointerGestures.current();
    return lease !== null && lease.gesture === siblingReorderGesture;
  };

  const isNodeInteractive = (nodeId: number) =>
    nodesRef.current.some((node) => node.id === nodeId)
    && (visibleNodeIdsRef === undefined || visibleNodeIdsRef.current.has(nodeId));

  const createNodeGesture = (
    nodeId: number,
    sample: PointerSample,
    shiftKey: boolean,
  ): PointerGesture | null => {
    if (shiftKey) {
      return createNodeConnectionGesture({
        sourceNodeId: nodeId,
        nodesRef,
        visibleNodeIdsRef,
        onConnectNodesRef,
        onConnectionTargetChangeRef,
      });
    }
    if (layoutModeRef.current === "auto") {
      siblingReorderGesture = createSiblingReorderGesture({
        nodeId,
        startSample: sample,
        nodesRef,
        visibleNodeIdsRef: siblingReorderVisibleNodeIdsRef,
        layoutModeRef,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
        dragThreshold,
      });
      return siblingReorderGesture;
    }
    return createNodeMoveGesture({
      nodeId,
      startSample: sample,
      nodesRef,
      onMoveNodeRef,
      onBeginNodeMoveRef,
      dragThreshold,
    });
  };

  const handleNodePointerDown = (
    bindingAtEntry: StageBinding,
    nodeId: number,
    event: FederatedPointerEvent,
  ) => {
    if (event.button !== 0) return;
    if (
      activeBinding !== bindingAtEntry
      || !event.composedPath().some((target: unknown) => target === bindingAtEntry.stage)
    ) {
      return;
    }

    const sample = toPointerSample(event, viewportRef.current);
    if (!hasFinitePointerCoordinates(sample)) return;
    if (!isNodeInteractive(nodeId)) {
      if (pointerGestures.owns(sample.pointerId)) pointerGestures.cancel();
      return;
    }
    if (touchGestures.pointerDown(sample)) return;

    pointerGestures.cancel();
    if (hasActiveGesture() || activeBinding !== bindingAtEntry || !isNodeInteractive(nodeId)) {
      return;
    }

    const gesture = createNodeGesture(nodeId, sample, event.shiftKey);
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

  const createNodePointerDownHandler = () => {
    const binding = activeBinding;

    return (nodeId: number, event: FederatedPointerEvent) => {
      if (binding === null || activeBinding !== binding) return;
      handleNodePointerDown(binding, nodeId, event);
    };
  };

  const handlePointerMove = (event: FederatedPointerEvent) => {
    const sample = toPointerSample(event, viewportRef.current);
    if (!hasFinitePointerCoordinates(sample)) return;
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
      if (!hasFinitePointerCoordinates(sample)) return;
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
      if (activeBinding !== binding || hasActiveGesture()) return;

      const gesture = createCanvasPanGesture({
        startSample: sample,
        startViewport: viewportRef.current,
        onViewportChangeRef,
        dragThreshold,
      });
      if (gesture) pointerGestures.start(sample.pointerId, gesture);
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

      if (ownsBinding) attemptCleanup(touchGestures.reset);
      attemptCleanup(() => { stage.off("pointerdown", handleStagePointerDown); });
      attemptCleanup(() => { stage.off("pointermove", handleStagePointerMove); });
      attemptCleanup(() => { stage.off("pointerup", handlePointerUp); });
      attemptCleanup(() => { stage.off("pointerupoutside", handlePointerUpOutside); });
      attemptCleanup(() => { stage.off("pointercancel", handlePointerCancel); });
      if (ownsBinding) {
        attemptCleanup(pointerGestures.cancel);
      }
      if (hasError) throw firstError;
    };
  };

  return {
    bind,
    createNodePointerDownHandler,
    cancelActiveGesture: cancelAllInteractions,
    hasActiveGesture,
    isSiblingReorderActive,
    activeNodeIds: () => pointerGestures.current()?.gesture.activeNodeIds?.() ?? [],
  };
}
