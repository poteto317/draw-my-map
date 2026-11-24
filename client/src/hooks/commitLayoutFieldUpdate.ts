import { planLayoutFieldUpdate } from "@/domain/nodes/planLayoutFieldUpdate";
import type { NodeMapState } from "@/types/nodeMapState";

/**
 * layout 設定フィールドを更新し、auto なら即リレイアウトしてから commit する。
 * 次状態の計算は planLayoutFieldUpdate（純）、ここは commit 副作用のみ。
 * auto で配置失敗時は false（commit しない）。manual は常に成功。
 */
export function commitLayoutFieldUpdate(
  current: NodeMapState,
  patch: Partial<NodeMapState>,
  commit: (next: NodeMapState) => void,
): boolean {
  const next = planLayoutFieldUpdate(current, patch);
  if (!next) return false;
  commit(next);
  return true;
}
