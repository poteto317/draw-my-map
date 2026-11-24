import type { NodeMapLayoutContext } from "@/domain/nodes/resolveLayoutSpacing";
import {
  settleTreeChangeOutcome,
  type TreeChangePlacementFailure,
} from "@/hooks/treeChangeOutcome";
import type { NodeMapState } from "@/types/nodeMapState";

export type StateChangeComputation<R extends { ok: boolean }> = {
  state: NodeMapState | null; // null なら確定しない
  outcome: R;
};

// 確定時点の最新のマップ状態から compute で候補と結果を計算し、applyStateChange で確定して、操作の結果を決める。
// settle は treeChangeOutcome と同じ規則（成功確定 / 候補失敗 / placement-failed）
export function applyStateChangeWithOutcome<R extends { ok: boolean }>(
  applyStateChange: (
    update: (
      current: NodeMapState,
      layout: NodeMapLayoutContext,
    ) => NodeMapState | null,
  ) => boolean,
  compute: (
    current: NodeMapState,
    layout: NodeMapLayoutContext,
  ) => StateChangeComputation<R>,
): R | TreeChangePlacementFailure {
  let outcome: R | null = null;
  const applied = applyStateChange((current, layout) => {
    const computation = compute(current, layout);
    outcome = computation.outcome;
    return computation.state;
  });
  // outcome はコールバックの中で代入するため、TypeScript は null に絞り込んでしまう。型引数で結果の型を明示する
  return settleTreeChangeOutcome<R>(applied, outcome);
}
