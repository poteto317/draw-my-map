import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";

export type TaskProgress = { percent: number; remaining: number };

export function collectTaskProgress(nodes: readonly Node[]): ReadonlyMap<number, TaskProgress> {
  const forest = indexNodeForest(nodes);
  const progress = new Map<number, TaskProgress>();
  if (!forest) return progress;

  const counts = new Map<number, { total: number; completed: number }>();
  for (const node of forest.postOrder) {
    const descendants = counts.get(node.id);
    const total = (descendants?.total ?? 0) + Number(node.task !== undefined);
    const completed = (descendants?.completed ?? 0) + Number(node.task?.completed === true);
    if (total === 0) continue;

    if (forest.childrenByParent.has(node.id)) {
      progress.set(node.id, { percent: Math.round(100 * completed / total), remaining: total - completed });
    }
    if (node.parentId !== null) {
      const parent = counts.get(node.parentId);
      counts.set(node.parentId, {
        total: (parent?.total ?? 0) + total,
        completed: (parent?.completed ?? 0) + completed,
      });
    }
  }
  return progress;
}
