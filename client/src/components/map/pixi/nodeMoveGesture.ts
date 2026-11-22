import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { createDragActivation } from "@/components/map/pixi/dragActivation";
import { hasFinitePointerCoordinates } from "@/components/map/pixi/pointerSample";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { snapToGrid } from "@/domain/nodes/snapGrid";
import type { Node } from "@/types/node";

export type LayoutSnapGesturePrefs = {
  readonly enabled: boolean;
  readonly gridStep: number;
};

type NodeMoveGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  nodesRef: LatestValue<readonly Node[]>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  onBeginNodeMoveRef: LatestValue<() => MapHistoryGroupLease>;
  layoutSnapPrefsRef?: LatestValue<LayoutSnapGesturePrefs>;
  dragThreshold: number;
};

export function createNodeMoveGesture({
  nodeId,
  startSample,
  nodesRef,
  onMoveNodeRef,
  onBeginNodeMoveRef,
  layoutSnapPrefsRef,
  dragThreshold,
}: NodeMoveGestureOptions): PointerGesture | null {
  const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
  if (!node || node.locked === true || !hasFinitePointerCoordinates(startSample)) return null;

  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  const startWorld = { ...startSample.world };
  let active = true;
  let finished = false;
  // 最初の有効な移動で取得する。クリックだけのジェスチャーでは履歴を開始しない
  let historyLease: MapHistoryGroupLease | null = null;
  const snapNodeToGridIfNeeded = () => {
    if (!historyLease?.isActive()) return;
    const snapPrefs = layoutSnapPrefsRef?.current;
    if (!snapPrefs?.enabled) return;
    const current = nodesRef.current.find((entry) => entry.id === nodeId);
    if (!current) return;
    const nextX = snapToGrid(current.x, snapPrefs.gridStep);
    const nextY = snapToGrid(current.y, snapPrefs.gridStep);
    if (nextX === current.x && nextY === current.y) return;
    onMoveNodeRef.current(nodeId, nextX, nextY);
  };

  const finish = () => {
    active = false;
    if (finished) return;
    finished = true;
    snapNodeToGridIfNeeded();
    historyLease?.finish();
  };

  return {
    move(sample) {
      if (!active || !hasFinitePointerCoordinates(sample)) return;
      if (!dragActivation.update(sample.screen)) return;
      const nextX = node.x + sample.world.x - startWorld.x;
      const nextY = node.y + sample.world.y - startWorld.y;
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
      historyLease ??= onBeginNodeMoveRef.current();
      // Undo・別編集などでグループが失効したら、以後の移動で新しい履歴を変更しない
      if (!historyLease.isActive()) {
        active = false;
        return;
      }
      onMoveNodeRef.current(
        nodeId,
        nextX,
        nextY,
      );
    },
    end: finish,
    cancel: finish,
    activeNodeIds: () => [nodeId],
  };
}
