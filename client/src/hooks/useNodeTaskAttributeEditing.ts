import type { NodeEditOutcome } from "@/domain/nodes/nodeTaskUpdateOutcome";
import { useCallback, useLayoutEffect, useRef } from "react";
import { nodeTagKey } from "@/domain/nodes/nodeTag";
import type { Node, NodeCustomAttribute } from "@/types/node";

export type AttributeEditTarget = { nodeId: number; documentRevision: number };
export type EditOutcome = NodeEditOutcome;
export type CommitTask = (target: AttributeEditTarget, expected: Node["task"], next: Node["task"]) => EditOutcome;
export type CommitCustomAttribute = (
  target: AttributeEditTarget,
  editKey: string | null,
  original: NodeCustomAttribute | null,
  next: NodeCustomAttribute | null,
  generation?: number,
) => EditOutcome;

function generationKey(nodeId: number, key: string): string {
  return `${nodeId}:${key}`;
}

export function useNodeTaskAttributeEditing(
  nodeId: number | null,
  documentRevision: number,
  disabled: boolean,
  applyTask: (id: number, expected: Node["task"], next: Node["task"]) => EditOutcome,
  applyCustomAttribute: (
    id: number,
    editKey: string | null,
    original: NodeCustomAttribute | null,
    next: NodeCustomAttribute | null,
  ) => EditOutcome,
) {
  const latest = useRef({ nodeId, documentRevision, disabled });
  const generations = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    latest.current = { nodeId, documentRevision, disabled };
    generations.current.clear();
  }, [nodeId, documentRevision, disabled]);

  const getAttributeGeneration = useCallback((key: string): number => {
    if (nodeId === null) return 0;
    return generations.current.get(generationKey(nodeId, key)) ?? 0;
  }, [nodeId]);

  const bumpGeneration = useCallback((keys: readonly string[]) => {
    if (nodeId === null) return;
    for (const key of keys) {
      const mapKey = generationKey(nodeId, key);
      generations.current.set(mapKey, (generations.current.get(mapKey) ?? 0) + 1);
    }
  }, [nodeId]);

  const getAttributeEditRejection = useCallback((target: AttributeEditTarget): string | undefined => {
    const current = latest.current;
    if (current.nodeId !== target.nodeId || current.documentRevision !== target.documentRevision) {
      return "編集対象が変わりました。";
    }
    return current.disabled ? "現在の状態では編集できません。" : undefined;
  }, []);

  const commitTask: CommitTask = useCallback((target, expected, next) => {
    const reason = getAttributeEditRejection(target);
    return reason ? { ok: false, reason } : applyTask(target.nodeId, expected, next);
  }, [applyTask, getAttributeEditRejection]);

  const commitCustomAttribute: CommitCustomAttribute = useCallback((
    target,
    editKey,
    original,
    next,
    generation,
  ) => {
    const reason = getAttributeEditRejection(target);
    if (reason) return { ok: false, reason };
    if (original !== null && next === null && editKey !== null) {
      if (generation !== getAttributeGeneration(editKey)) {
        return { ok: false, reason: "カスタム属性が更新されたか、現在の状態では編集できません。" };
      }
    }
    const result = applyCustomAttribute(target.nodeId, editKey, original, next);
    if (!result.ok) return result;
    if (!result.changed) return result;
    if (original === null && next !== null) {
      bumpGeneration([nodeTagKey(next.name)]);
    } else if (original !== null && next === null && editKey !== null) {
      bumpGeneration([editKey]);
    } else if (original !== null && next !== null && editKey !== null) {
      bumpGeneration([editKey, nodeTagKey(next.name)]);
    }
    return result;
  }, [applyCustomAttribute, bumpGeneration, getAttributeEditRejection, getAttributeGeneration]);

  return { commitTask, commitCustomAttribute, getAttributeEditRejection, getAttributeGeneration };
}