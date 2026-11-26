import {
  computeNextCustomAttributes,
  formatCustomAttributeFailure,
} from "@/domain/nodes/nodeCustomAttributeUpdate";
import {
  areCustomAttributesEqual,
  areNodeTasksEqual,
  normalizeNodeTask,
  withCustomAttributes,
  withNodeTask,
} from "@/domain/nodes/nodeTaskAttributes";
import type { Node, NodeCustomAttribute } from "@/types/node";

export type NodeTaskUpdateComputation = {
  nodes: Node[] | null;
  matched: boolean;
  changed: boolean;
};

export type NodeCustomAttributeUpdateComputation = NodeTaskUpdateComputation & {
  failureReason: string | null;
};

export function computeNodeTaskUpdate(
  currentNodes: readonly Node[],
  id: number,
  expected: Node["task"],
  next: Node["task"],
): NodeTaskUpdateComputation {
  let matched = false;
  let changed = false;
  const nodes = currentNodes.map((item) => {
    if (item.id !== id || item.locked || !areNodeTasksEqual(item.task, expected)) return item;
    matched = true;
    const updated = withNodeTask(item, next);
    if (updated === item) return item;
    changed = true;
    return updated;
  });
  if (!matched || !changed) return { nodes: null, matched, changed };
  return { nodes, matched, changed };
}

export function normalizeTaskForEdit(next: Node["task"]) {
  return next === undefined ? { ok: true as const, value: undefined as Node["task"] } : normalizeNodeTask(next);
}

export function computeNodeCustomAttributeUpdate(
  currentNodes: readonly Node[],
  id: number,
  editKey: string | null,
  original: NodeCustomAttribute | null,
  next: NodeCustomAttribute | null,
): NodeCustomAttributeUpdateComputation {
  let matched = false;
  let changed = false;
  let failureReason: string | null = null;
  const nodes = currentNodes.map((item) => {
    if (item.id !== id || item.locked) return item;
    const nextAttributes = computeNextCustomAttributes(item.customAttributes, editKey, original, next);
    if (!nextAttributes.ok) {
      failureReason = formatCustomAttributeFailure(nextAttributes.reason);
      return item;
    }
    matched = true;
    if (areCustomAttributesEqual(item.customAttributes, nextAttributes.value)) return item;
    changed = true;
    return withCustomAttributes(item, nextAttributes.value);
  });
  if (failureReason !== null) return { nodes: null, matched, changed, failureReason };
  if (!matched || !changed) return { nodes: null, matched, changed, failureReason: null };
  return { nodes, matched, changed, failureReason: null };
}