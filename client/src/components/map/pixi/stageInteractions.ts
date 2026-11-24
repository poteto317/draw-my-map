import type { Viewport } from "@/components/map/mapViewport";
import { createCanvasPanGesture } from "@/components/map/pixi/canvasPanGesture";
import {
  createMarqueeSelectGesture,
  type MarqueeRect,
  type MarqueeSelectionMode,
} from "@/components/map/pixi/marqueeSelectGesture";
import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { createPointerGestureSession } from "@/components/map/pixi/pointerGestureSession";
import {
  hasFinitePointerCoordinates,
  toPointerSample,
} from "@/components/map/pixi/pointerSample";
import { resolveAutoNodeDragKind } from "@/components/map/pixi/resolveAutoNodeDragKind";
import { createShiftNodePendingGesture } from "@/components/map/pixi/shiftNodePendingGesture";
import { createSiblingReorderGesture } from "@/components/map/pixi/siblingReorderGesture";
import { createToggleNodePendingGesture } from "@/components/map/pixi/toggleNodePendingGesture";
import { createTouchGestureCoordinator } from "@/components/map/pixi/touchGestureCoordinator";
import { wrapBackgroundGesture } from "@/components/map/pixi/wrapBackgroundGesture";
import type { SiblingReorderPreview } from "@/components/map/siblingReorderDropSlot";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import { isApplePlatform as detectApplePlatform } from "@/domain/platform/isApplePlatform";
import type { Node } from "@/types/node";
import type { LayoutSnapGesturePrefs } from "@/components/map/pixi/nodeMoveGesture";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { Container, FederatedPointerEvent } from "pixi.js";

export type { LatestValue } from "@/components/map/pixi/pointerGesture";
export type { MarqueeRect, MarqueeSelectionMode };

type StageInteractionOptions = {
  nodesRef: LatestValue<readonly Node[]>;
  visibleNodeIdsRef?: LatestValue<ReadonlySet<number>>;
  viewportRef: LatestValue<Viewport>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onToggleNodeSelectionRef?: LatestValue<(id: number) => void>;
  onSelectNodeRangeRef?: LatestValue<(targetId: number, visibleOrdered: readonly number[]) => void>;
  onClearSelectionRef?: LatestValue<() => void>;
  onSetSelectionFromMarqueeRef?: LatestValue<(args: {
    mode: MarqueeSelectionMode;
    ids: readonly number[];
  }) => void>;
  onMarqueeRectChangeRef?: LatestValue<(rect: MarqueeRect | null) => void>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  onBeginNodeMoveRef: LatestValue<() => MapHistoryGroupLease>;
  /** auto+ピン座標ドラッグ。current 未定義ならピンは無操作（並べ替えへ落とさない） */
  onMovePinnedNodeRef?: LatestValue<((id: number, x: number, y: number) => void) | undefined>;
  /** ピンドラッグ終了時の再配置（履歴 finish 前）。未定義ならピンは無操作 */
  onFinalizePinnedNodeMoveRef?: LatestValue<(() => boolean) | undefined>;
  layoutSnapPrefsRef?: LatestValue<LayoutSnapGesturePrefs>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => void>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
  layoutModeRef: LatestValue<NodeLayoutMode>;
  onReorderSiblingRef: LatestValue<(nodeId: number, request: SiblingReorderRequest) => void>;
  onSiblingReorderPreviewChangeRef: LatestValue<(preview: SiblingReorderPreview | null) => void>;
  shouldIgnorePointerDownRef?: LatestValue<() => boolean>;
  isApplePlatformRef?: LatestValue<() => boolean>;
  dragThreshold?: number;
};

type InteractiveStage = Pick<Container, "on" | "off">;

type StageBinding = {
  stage: InteractiveStage;
};

type ModifierKeys = {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

const noopMarqueeRectChange: LatestValue<(rect: MarqueeRect | null) => void> = {
  current: () => {},
};
const noopSetSelectionFromMarquee: LatestValue<(args: {
  mode: MarqueeSelectionMode;
  ids: readonly number[];
}) => void> = {
  current: () => {},
};

export function createStageInteractions({
  nodesRef,
  visibleNodeIdsRef,
  viewportRef,
  onSelectNodeRef,
  onToggleNodeSelectionRef,
  onSelectNodeRangeRef,
  onClearSelectionRef,
  onSetSelectionFromMarqueeRef = noopSetSelectionFromMarquee,
  onMarqueeRectChangeRef = noopMarqueeRectChange,
  onMoveNodeRef,
  onBeginNodeMoveRef,
  onMovePinnedNodeRef,
  onFinalizePinnedNodeMoveRef,
  layoutSnapPrefsRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  onViewportChangeRef,
  layoutModeRef,
  onReorderSiblingRef,
  onSiblingReorderPreviewChangeRef,
  shouldIgnorePointerDownRef,
  isApplePlatformRef,
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
  // Escape / isSiblingReorderActive 用。lease に載っているジェスチャー
  // （プレーンなら並べ替え本体、トグル経由なら外側 pending wrapper）
  let siblingReorderLeaseGesture: PointerGesture | null = null;

  const markSiblingReorderActive = (leaseGesture: PointerGesture | null) => {
    siblingReorderLeaseGesture = leaseGesture;
  };

  const isApple = () => (isApplePlatformRef?.current ?? detectApplePlatform)();

  const isToggleModifier = (modifiers: ModifierKeys) =>
    isApple() ? modifiers.metaKey : modifiers.ctrlKey;

  const clearSelection = () => {
    onClearSelectionRef?.current();
  };

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
    return lease !== null
      && siblingReorderLeaseGesture !== null
      && lease.gesture === siblingReorderLeaseGesture;
  };

  const isNodeInteractive = (nodeId: number) =>
    nodesRef.current.some((node) => node.id === nodeId)
    && (visibleNodeIdsRef === undefined || visibleNodeIdsRef.current.has(nodeId));

  const createPlainNodeGesture = (
    nodeId: number,
    sample: PointerSample,
    options?: {
      dragThreshold?: number;
      /** 並べ替え時の Escape 判定対象。省略時は並べ替え本体、トグル経由は現在の lease */
      siblingReorderLease?: "self" | "currentLease";
    },
  ): PointerGesture | null => {
    const threshold = options?.dragThreshold ?? dragThreshold;
    if (layoutModeRef.current === "auto") {
      const target = nodesRef.current.find((node) => node.id === nodeId);
      const hasPinnedMoveCallbacks = onMovePinnedNodeRef?.current !== undefined
        && onFinalizePinnedNodeMoveRef?.current !== undefined;
      const dragKind = resolveAutoNodeDragKind(target, hasPinnedMoveCallbacks);

      if (dragKind.kind === "noop") {
        markSiblingReorderActive(null);
        return null;
      }

      if (dragKind.kind === "pinned-move") {
        markSiblingReorderActive(null);
        // ジェスチャ中にコールバックが外れても throw しない
        const onMovePinnedNodeLiveRef: LatestValue<(id: number, x: number, y: number) => void> = {
          get current() {
            return (id: number, x: number, y: number) => {
              onMovePinnedNodeRef?.current?.(id, x, y);
            };
          },
        };
        const onFinalizePinnedLiveRef: LatestValue<() => boolean> = {
          get current() {
            return () => onFinalizePinnedNodeMoveRef?.current?.() ?? true;
          },
        };
        return createNodeMoveGesture({
          nodeId,
          startSample: sample,
          nodesRef,
          onMoveNodeRef: onMovePinnedNodeLiveRef,
          onBeginNodeMoveRef,
          onBeforeFinishRef: onFinalizePinnedLiveRef,
          layoutSnapPrefsRef,
          dragThreshold: threshold,
        });
      }

      const reorder = createSiblingReorderGesture({
        nodeId,
        startSample: sample,
        nodesRef,
        visibleNodeIdsRef: siblingReorderVisibleNodeIdsRef,
        layoutModeRef,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
        dragThreshold: threshold,
      });
      if (reorder === null) {
        markSiblingReorderActive(null);
      } else if (options?.siblingReorderLease === "currentLease") {
        // トグル pending の外側が lease に載るため、現在の lease.gesture を判定基準にする
        markSiblingReorderActive(pointerGestures.current()?.gesture ?? null);
      } else {
        markSiblingReorderActive(reorder);
      }
      return reorder;
    }
    return createNodeMoveGesture({
      nodeId,
      startSample: sample,
      nodesRef,
      onMoveNodeRef,
      onBeginNodeMoveRef,
      layoutSnapPrefsRef,
      dragThreshold: threshold,
    });
  };

  const createNodeGesture = (
    nodeId: number,
    sample: PointerSample,
    modifiers: ModifierKeys,
  ): PointerGesture | null => {
    if (modifiers.shiftKey) {
      return createShiftNodePendingGesture({
        nodeId,
        startSample: sample,
        nodesRef,
        visibleNodeIdsRef,
        onSelectNodeRef,
        onSelectNodeRangeRef,
        onConnectNodesRef,
        onConnectionTargetChangeRef,
        dragThreshold,
      });
    }
    if (isToggleModifier(modifiers)) {
      return createToggleNodePendingGesture({
        nodeId,
        startSample: sample,
        onToggleNodeSelectionRef,
        createActivatedDragGesture: () => createPlainNodeGesture(nodeId, sample, {
          dragThreshold: 0,
          siblingReorderLease: "currentLease",
        }),
        dragThreshold,
      });
    }
    return createPlainNodeGesture(nodeId, sample);
  };

  const handleNodePointerDown = (
    bindingAtEntry: StageBinding,
    nodeId: number,
    event: FederatedPointerEvent,
  ) => {
    if (event.button !== 0 || shouldIgnorePointerDownRef?.current()) return;
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

    const modifiers: ModifierKeys = {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
    };
    const gesture = createNodeGesture(nodeId, sample, modifiers);
    if (!gesture) return;

    const nextGesture = pointerGestures.start(sample.pointerId, gesture);
    if (!nextGesture) return;

    // プレーン（非 Shift・非トグル）のみ pointerdown で単一選択。Shift/トグルは遅延。
    if (!modifiers.shiftKey && !isToggleModifier(modifiers)) {
      try {
        onSelectNodeRef.current(nodeId);
      } catch (error) {
        pointerGestures.clear(nextGesture);
        throw error;
      }
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
      if (shouldIgnorePointerDownRef?.current()) return;

      const sample = toPointerSample(event, viewportRef.current);
      if (!hasFinitePointerCoordinates(sample)) return;
      if (touchGestures.pointerDown(sample)) return;

      const gestureAtEntry = pointerGestures.current();
      if (gestureAtEntry !== null && event.pointerId !== gestureAtEntry.pointerId) return;
      // 背景 pointerdown では clear しない（未 activated 終端で clear）
      if (
        gestureAtEntry !== null
        && pointerGestures.current() === gestureAtEntry
        && activeBinding === binding
        && event.pointerId === gestureAtEntry.pointerId
      ) {
        pointerGestures.cancel();
      }
      if (activeBinding !== binding || hasActiveGesture()) return;

      const modifiers: ModifierKeys = {
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      };
      const innerGesture = modifiers.altKey
        ? createMarqueeSelectGesture({
          startSample: sample,
          nodesRef,
          visibleNodeIdsRef,
          onMarqueeRectChangeRef,
          onSetSelectionFromMarqueeRef,
          mode: isToggleModifier(modifiers) ? "add" : "replace",
          dragThreshold,
        })
        : createCanvasPanGesture({
          startSample: sample,
          startViewport: viewportRef.current,
          onViewportChangeRef,
          dragThreshold,
        });
      if (!innerGesture) return;
      const gesture = wrapBackgroundGesture(innerGesture, clearSelection);
      pointerGestures.start(sample.pointerId, gesture);
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
