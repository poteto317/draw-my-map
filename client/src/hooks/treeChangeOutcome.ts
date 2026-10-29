export type TreeChangePlacementFailure = { ok: false; reason: "placement-failed" };

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
