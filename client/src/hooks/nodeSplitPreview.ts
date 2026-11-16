import type { NodeSplitPlan } from "@/domain/nodes/nodeSplit";
import { formatNodeSplitFailureNotice } from "@/domain/nodes/nodeSplitMessages";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";

// 分割ダイアログの状態文言（常設のライブリージョンに出す）。stale を最優先し、失敗の計画はその reason の文言にする
export function describeNodeSplitStatus(stale: boolean, plan: NodeSplitPlan | null): string {
  if (stale) return STALE_DIALOG_MESSAGE;
  if (plan === null) return "";
  if (!plan.ok) return formatNodeSplitFailureNotice(plan.reason).message;
  return `${plan.fragments.length}件に分割します（${plan.fragments.length - 1}件を追加）`;
}
