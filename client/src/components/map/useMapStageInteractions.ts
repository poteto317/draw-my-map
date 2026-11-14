import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { SiblingReorderPreview } from "@/components/map/siblingReorderDropSlot";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useStageInteractionValues } from "@/components/map/useStageInteractionValues";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type UseMapStageInteractionsOptions = {
  runtime: PixiRuntime | null;
  nodes: readonly Node[];
  visibleNodeIds?: ReadonlySet<number>;
  viewportRef: LatestValue<Viewport>;
  onViewportChange: (viewport: Viewport) => void;
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onBeginNodeMove: () => MapHistoryGroupLease;
  onConnectNodes: (parentId: number, childId: number) => void;
  layoutMode: NodeLayoutMode;
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
  shouldIgnorePointerDown?: () => boolean;
};

function bindPixiStage(
  runtime: PixiRuntime,
  bind: ReturnType<typeof createStageInteractions>["bind"],
) {
  // Pixi の stage は React の不変 props ではなく、命令的に設定する描画ホスト
  const stage = runtime.app.stage;
  stage.eventMode = "static";
  stage.hitArea = runtime.app.screen;
  return bind(stage);
}

export function useMapStageInteractions({
  runtime,
  nodes,
  visibleNodeIds,
  viewportRef,
  onViewportChange,
  onSelectNode,
  onMoveNode,
  onBeginNodeMove,
  onConnectNodes,
  layoutMode,
  onReorderSibling,
  shouldIgnorePointerDown = () => false,
}: UseMapStageInteractionsOptions) {
  const shouldIgnorePointerDownRef = useLatestRef(shouldIgnorePointerDown);
  const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<number | null>(null);
  const onConnectionTargetChangeRef = useRef(setConnectionTargetNodeId);
  const [siblingReorderPreview, setSiblingReorderPreview] = useState<SiblingReorderPreview | null>(null);
  const onSiblingReorderPreviewChangeRef = useRef(setSiblingReorderPreview);
  const {
    nodesRef,
    visibleNodeIdsRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onBeginNodeMoveRef,
    onConnectNodesRef,
    onViewportChangeRef,
    layoutModeRef,
    onReorderSiblingRef,
  } = useStageInteractionValues({
    nodes,
    visibleNodeIds,
    onViewportChange,
    onSelectNode,
    onMoveNode,
    onBeginNodeMove,
    onConnectNodes,
    layoutMode,
    onReorderSibling,
  });

  // ジェスチャー本体は一度だけ作る。渡す refs は保持するだけで、.current の読み取りはイベント／effect 側。
  // eslint-disable-next-line react-hooks/refs -- create 時は LatestValue を保持するだけ。.current はイベント／effect で読む
  const [interactions] = useState(() =>
    createStageInteractions({
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
      shouldIgnorePointerDownRef,
    }),
  );

  useLayoutEffect(() => {
    if (interactions.activeNodeIds().some((nodeId) => !visibleNodeIdsRef.current.has(nodeId))) {
      interactions.cancelActiveGesture();
    }
  }, [interactions, nodes, visibleNodeIds, visibleNodeIdsRef]);

  useEffect(() => {
    if (!runtime) return;
    return bindPixiStage(runtime, interactions.bind);
  }, [runtime, interactions]);

  return {
    connectionTargetNodeId,
    siblingReorderPreview,
    createNodePointerDownHandler: interactions.createNodePointerDownHandler,
    cancelActiveGesture: interactions.cancelActiveGesture,
    hasActiveGesture: interactions.hasActiveGesture,
    isSiblingReorderActive: interactions.isSiblingReorderActive,
  };
}
