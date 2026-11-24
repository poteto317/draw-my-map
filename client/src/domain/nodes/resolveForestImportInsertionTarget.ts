import type { ForestInsertionTarget } from "@/domain/nodes/nodeForestInsertion";

export type ForestImportPlacement = "root" | "child";

/** Outline / Exchange 取り込み UI の「ルート／子」選択。正本は `ForestImportPlacement`。 */
export type OutlineImportTarget = ForestImportPlacement;

export type ResolveForestImportInsertionTargetInput = {
  placement: ForestImportPlacement;
  parentCandidateId: number | null;
  parentCandidateStale: boolean;
};

export type ResolveForestImportInsertionTargetResult =
  | { ok: true; target: ForestInsertionTarget }
  | { ok: false; reason: "parent-missing" };

export function resolveForestImportInsertionTarget(
  input: ResolveForestImportInsertionTargetInput,
): ResolveForestImportInsertionTargetResult {
  if (input.placement === "child") {
    if (input.parentCandidateId === null || input.parentCandidateStale) {
      return { ok: false, reason: "parent-missing" };
    }
    return { ok: true, target: { kind: "child", parentId: input.parentCandidateId } };
  }
  return { ok: true, target: { kind: "root" } };
}