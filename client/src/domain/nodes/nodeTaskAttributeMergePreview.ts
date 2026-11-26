import type { NodeMergePlan } from "@/domain/nodes/nodeMerge";
import type { Node } from "@/types/node";

export type TaskAttributeMergePreviewText = {
  taskText?: string;
  customAttributeText?: string;
};

function formatPreviewLabel(label: string): string {
  if (label === "") return "（空）";
  if (label.trim() === "") return "（空白のみ）";
  return label;
}

export function describeMergeTaskAttributes(
  plan: Extract<NodeMergePlan, { ok: true }>,
  labelById: ReadonlyMap<number, string>,
): TaskAttributeMergePreviewText {
  const {
    task, taskSourceId, discardedTaskCount, customAttributes, duplicateAttributeCount, discardedAttributeNames,
  } = plan.taskAttributes;
  const preview: TaskAttributeMergePreviewText = {};

  if (task && taskSourceId !== null) {
    const label = formatPreviewLabel(labelById.get(taskSourceId) ?? "");
    const details = [`『${label}』のタスク`, task.completed ? "完了" : "未完了"];
    if (task.dueDate) details.push(`期限 ${task.dueDate}`);
    if (task.assignee) details.push(`担当者 ${task.assignee}`);
    if (discardedTaskCount) details.push(`他の ${discardedTaskCount} 件を破棄`);
    preview.taskText = details.join("、");
  }

  if (customAttributes) {
    const details = [`${customAttributes.length} 件を保持`];
    if (duplicateAttributeCount) details.push(`重複 ${duplicateAttributeCount} 件を除く`);
    if (discardedAttributeNames.length) {
      const uniqueNames = [...new Set(discardedAttributeNames)];
      const discardLabel = uniqueNames.length === discardedAttributeNames.length
        ? `同名 ${discardedAttributeNames.length} 件を破棄`
        : `同名 ${uniqueNames.length} 種類（計 ${discardedAttributeNames.length} 件）を破棄`;
      details.push(`${discardLabel}（${uniqueNames.join("、")}）`);
    }
    preview.customAttributeText = details.join("、");
  }

  return preview;
}