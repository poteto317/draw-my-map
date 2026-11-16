import type { NodeImportance } from "@/types/nodeImportance";

export const DEFAULT_NODE_IMPORTANCE: NodeImportance = "medium";

// 重要度の序列（大きいほど重要）。解像度フィルターの表示判定と、統合で選ぶ「最も高い重要度」が同じ表を使う
export const IMPORTANCE_RANK: Readonly<Record<NodeImportance, number>> = {
  high: 2,
  medium: 1,
  low: 0,
};

// 最も高い重要度を返す。空のときは既定の重要度（呼び出し側は 1 件以上を渡す）
export function maxNodeImportance(values: readonly NodeImportance[]): NodeImportance {
  let highest: NodeImportance | null = null;
  for (const value of values) {
    if (highest === null || IMPORTANCE_RANK[value] > IMPORTANCE_RANK[highest]) highest = value;
  }
  return highest ?? DEFAULT_NODE_IMPORTANCE;
}
