import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type TreeChangePlacementFailure = { ok: false; reason: "placement-failed" };

export type TreeChangeComputation<R extends { ok: boolean }> = {
  nodes: Node[] | null; // null なら確定しない
  outcome: R;
};

const PLACEMENT_FAILURE: TreeChangePlacementFailure = { ok: false, reason: "placement-failed" };

// applyTreeChange の後で、候補の計算の結果と、確定できたかから、操作の結果を決める。
// 候補を作れた後に失敗するのは、全体の自動配置だけ（placement-failed）
export function settleTreeChangeOutcome<R extends { ok: boolean }>(
  applied: boolean,
  outcome: R | null,
): R | TreeChangePlacementFailure {
  if (applied && outcome?.ok) return outcome;
  if (outcome === null || outcome.ok) return { ...PLACEMENT_FAILURE };
  return outcome;
}

// 確定時点の最新の配列から compute で候補と結果を計算し、applyTreeChange で確定して、操作の結果を決める
export function applyTreeChangeWithOutcome<R extends { ok: boolean }>(
  applyTreeChange: (update: (currentNodes: readonly Node[], mode: NodeLayoutMode) => Node[] | null) => boolean,
  compute: (currentNodes: readonly Node[], mode: NodeLayoutMode) => TreeChangeComputation<R>,
): R | TreeChangePlacementFailure {
  let outcome: R | null = null;
  const applied = applyTreeChange((currentNodes, mode) => {
    const computation = compute(currentNodes, mode);
    outcome = computation.outcome;
    return computation.nodes;
  });
  // outcome はコールバックの中で代入するため、TypeScript は null に絞り込んでしまう。型引数で結果の型を明示する
  return settleTreeChangeOutcome<R>(applied, outcome);
}
