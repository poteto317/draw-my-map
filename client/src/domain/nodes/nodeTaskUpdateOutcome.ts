import type {
  NodeCustomAttributeUpdateComputation,
  NodeTaskUpdateComputation,
} from "@/domain/nodes/nodeTaskUpdate";

export type NodeEditOutcome = { ok: true; changed: boolean } | { ok: false; reason: string };

export function interpretTaskUpdateOutcome(
  applied: boolean,
  computation: NodeTaskUpdateComputation | null,
): NodeEditOutcome {
  if (applied) return { ok: true, changed: true };
  if (computation?.matched && !computation.changed) return { ok: true, changed: false };
  return { ok: false, reason: "タスクが更新されたか、現在の状態では編集できません。" };
}

export function interpretCustomAttributeUpdateOutcome(
  applied: boolean,
  computation: NodeCustomAttributeUpdateComputation | null,
): NodeEditOutcome {
  if (applied) return { ok: true, changed: true };
  if (computation?.failureReason) return { ok: false, reason: computation.failureReason };
  if (computation?.matched && !computation.changed) return { ok: true, changed: false };
  return { ok: false, reason: "カスタム属性が更新されたか、現在の状態では編集できません。" };
}