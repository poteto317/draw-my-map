import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export type SelectionImportanceSummary =
  | { kind: "none" }
  | { kind: "uniform"; importance: NodeImportance; count: number }
  | { kind: "mixed"; count: number };

// 対象IDのうち存在するノードだけで、重要度が揃っているかと件数を求める
export function summarizeSelectionImportance(
  nodes: readonly Node[],
  ids: readonly number[],
): SelectionImportanceSummary {
  const targetIds = new Set(ids);
  const importances = nodes
    .filter((node) => targetIds.has(node.id))
    .map((node) => node.importance);
  if (importances.length === 0) return { kind: "none" };

  const [first] = importances;
  return importances.every((importance) => importance === first)
    ? { kind: "uniform", importance: first, count: importances.length }
    : { kind: "mixed", count: importances.length };
}
