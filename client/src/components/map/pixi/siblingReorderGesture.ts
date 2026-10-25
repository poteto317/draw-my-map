import { createDragActivation } from "@/components/map/pixi/dragActivation";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { hasFinitePointerCoordinates } from "@/components/map/pixi/pointerSample";
import {
  resolveSiblingReorderDrop,
  type SiblingReorderDrop,
  type SiblingReorderPreview,
} from "@/components/map/siblingReorderDropSlot";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type SiblingReorderGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  // 表示用の座標（displayNodes）
  nodesRef: LatestValue<readonly Node[]>;
  visibleNodeIdsRef: LatestValue<ReadonlySet<number>>;
  layoutModeRef: LatestValue<NodeLayoutMode>;
  onReorderSiblingRef: LatestValue<(nodeId: number, request: SiblingReorderRequest) => void>;
  onSiblingReorderPreviewChangeRef: LatestValue<(preview: SiblingReorderPreview | null) => void>;
  dragThreshold: number;
};

// 挿入先と線の座標が同じなら、同じプレビューとみなす。slot だけで比べると、
// ドラッグ中に自動配置で兄弟の座標が変わったときに線が古い位置に残る
function isSameDrop(a: SiblingReorderDrop, b: SiblingReorderDrop): boolean {
  if (a.target?.position !== b.target?.position || a.target?.anchorId !== b.target?.anchorId) {
    return false;
  }
  if (a.indicator === null || b.indicator === null) return a.indicator === b.indicator;
  return a.indicator.left === b.indicator.left
    && a.indicator.right === b.indicator.right
    && a.indicator.y === b.indicator.y;
}

export function createSiblingReorderGesture({
  nodeId,
  startSample,
  nodesRef,
  visibleNodeIdsRef,
  layoutModeRef,
  onReorderSiblingRef,
  onSiblingReorderPreviewChangeRef,
  dragThreshold,
}: SiblingReorderGestureOptions): PointerGesture | null {
  const exists = nodesRef.current.some((node) => node.id === nodeId);
  if (!exists || !hasFinitePointerCoordinates(startSample)) return null;

  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  // しきい値を超えてプレビューを出したか。超えていなければクリックとして扱う
  let activated = false;
  let lastDrop: SiblingReorderDrop | null = null;
  let finished = false;

  const resolveDrop = (pointerY: number) =>
    resolveSiblingReorderDrop(nodesRef.current, visibleNodeIdsRef.current, nodeId, pointerY);

  const cancel = () => {
    if (finished) return;
    finished = true;
    if (activated) onSiblingReorderPreviewChangeRef.current(null);
  };

  return {
    move(sample) {
      if (finished || !hasFinitePointerCoordinates(sample)) return;
      if (layoutModeRef.current !== "auto") {
        cancel();
        return;
      }
      if (!dragActivation.update(sample.screen)) return;
      const drop = resolveDrop(sample.world.y);
      // 判定できないときは前のプレビューを保つ
      if (drop === null) return;
      if (lastDrop !== null && isSameDrop(drop, lastDrop)) return;
      activated = true;
      lastDrop = drop;
      onSiblingReorderPreviewChangeRef.current({ nodeId, indicator: drop.indicator });
    },
    end(sample) {
      if (finished) return;
      finished = true;
      if (!activated) return;
      onSiblingReorderPreviewChangeRef.current(null);
      if (layoutModeRef.current !== "auto" || !hasFinitePointerCoordinates(sample)) return;
      // move で控えた値を使わず、離した座標と最新の ref で求め直す
      const drop = resolveDrop(sample.world.y);
      if (drop?.target) {
        onReorderSiblingRef.current(nodeId, { kind: "drop", target: drop.target });
      }
    },
    cancel,
    activeNodeIds: () => [nodeId],
  };
}
