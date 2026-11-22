import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

export const MAX_PART_NODES = 10_000;
export const MAX_PARTS = 100;
export const MAX_PART_NAME = 200;

export type Part = {
  id: string;
  name: string;
  nodes: Node[];
  createdAt: string;
};

export type PartsStore = {
  version: 1;
  parts: Part[];
};

export type BuildPartFromSubtreeResult =
  | { readonly ok: true; readonly part: Part }
  | { readonly ok: false; readonly reason: "too-large" | "root-missing" };

// 共有定数参照を避け、呼び出しごとに新しいオブジェクト・配列を返す（L-461）
export function createEmptyPartsStore(): PartsStore {
  return { version: 1, parts: [] };
}

// ID 生成は呼び出し側の副作用。buildPartFromSubtree は純粋な組み立てのみ
export function createPartId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) return randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 選択根の部分木を部品化する。上限検証はここだけ（Task 4 では再実装しない）
export function buildPartFromSubtree(
  nodes: readonly Node[],
  rootId: number,
  name: string,
  id: string,
  createdAt: string,
): BuildPartFromSubtreeResult {
  const hasRoot = nodes.some((node) => node.id === rootId);
  if (!hasRoot) return { ok: false, reason: "root-missing" };

  const subtreeIds = collectSubtreeIds(nodes, rootId);
  if (subtreeIds.size > MAX_PART_NODES) return { ok: false, reason: "too-large" };

  const snapshot: Node[] = [];
  for (const node of nodes) {
    if (!subtreeIds.has(node.id)) continue;
    snapshot.push(node.id === rootId ? { ...node, parentId: null } : node);
  }

  return {
    ok: true,
    part: {
      id,
      name,
      nodes: snapshot,
      createdAt,
    },
  };
}
