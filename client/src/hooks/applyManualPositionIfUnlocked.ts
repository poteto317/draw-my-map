import { assertManualPositionCommitAllowed } from "@/domain/nodes/nodeEditLock";
import type { Node } from "@/types/node";

export type ManualMoveApply = (
  update: (currentNodes: readonly Node[]) => Node[] | null,
) => boolean;

/** 手動配置の座標更新を、編集ロック済みノードの移動を拒否しつつ preview/commit 経路へ渡す。 */
export function applyManualPositionIfUnlocked(
  applyManualMove: ManualMoveApply,
  buildNext: (currentNodes: readonly Node[]) => Node[] | null,
): boolean {
  return applyManualMove((currentNodes) => {
    const nextNodes = buildNext(currentNodes);
    if (!nextNodes) return null;
    if (!assertManualPositionCommitAllowed(currentNodes, nextNodes).ok) return null;
    return nextNodes;
  });
}