import type { NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { formatNodeMergeFailureNotice } from "@/domain/nodes/nodeMergeMessages";
import { STALE_DIALOG_MESSAGE, formatPreviewLabel } from "@/hooks/dialogPreviewText";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

// 統合のプレビューに並べる「統合されて消えるノード」の最大行数。超えた分は件数だけ示し、確定の対象には含める
export const NODE_MERGE_PREVIEW_LIMIT = 200;

const IMPORTANCE_LABELS: Record<NodeImportance, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export type NodeMergePreview = {
  // 残すノード（主選択）のラベル（整形前。表示側で formatPreviewLabel を通す）
  survivorLabel: string;
  // 統合後のラベル（整形前。表示側で formatPreviewLabel を通す）
  label: string;
  importanceLabel: string;
  illustrationText: string;
  movedChildCount: number;
  discardedIllustrationCount: number;
  // 統合されて消えるノードのラベル（配列順で先頭から NODE_MERGE_PREVIEW_LIMIT 件まで。整形前）
  absorbedLabels: readonly string[];
  hiddenAbsorbedCount: number;
};

// 統合ダイアログの状態文言。stale を最優先し、失敗の計画はその reason の文言にする
export function describeNodeMergeStatus(stale: boolean, plan: NodeMergePlan | null): string {
  if (stale) return STALE_DIALOG_MESSAGE;
  if (plan === null) return "";
  if (!plan.ok) return formatNodeMergeFailureNotice(plan.reason).message;
  return `${plan.absorbedIds.length + 1}件を1件に統合します`;
}

function describeIllustration(plan: Extract<NodeMergePlan, { ok: true }>, labelById: ReadonlyMap<number, string>): string {
  if (plan.illustrationFrom === "primary") return "主選択のイラストを残す";
  if (plan.illustrationFrom === "none") return "イラストなし";
  const sourceLabel = plan.illustrationSourceId === null ? "" : labelById.get(plan.illustrationSourceId) ?? "";
  return `『${formatPreviewLabel(sourceLabel)}』のイラストを引き継ぐ`;
}

// 統合の計画をプレビューの表示用にまとめる。失敗の計画（見せるものが無い）は null
export function buildNodeMergePreview(nodes: readonly Node[], plan: NodeMergePlan): NodeMergePreview | null {
  if (!plan.ok) return null;
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const absorbedLabels = plan.absorbedIds.map((id) => labelById.get(id) ?? "");
  return {
    survivorLabel: labelById.get(plan.survivorId) ?? "",
    label: plan.label,
    importanceLabel: IMPORTANCE_LABELS[plan.importance],
    illustrationText: describeIllustration(plan, labelById),
    movedChildCount: plan.movedChildCount,
    discardedIllustrationCount: plan.discardedIllustrationCount,
    absorbedLabels: absorbedLabels.slice(0, NODE_MERGE_PREVIEW_LIMIT),
    hiddenAbsorbedCount: Math.max(0, absorbedLabels.length - NODE_MERGE_PREVIEW_LIMIT),
  };
}
