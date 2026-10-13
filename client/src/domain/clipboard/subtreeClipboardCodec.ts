import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import type { Node } from "@/types/node";

// 正規化済みの単一の部分木。rootIdは唯一の根から求めた値で、クリップボードの形式には含めない
export type SubtreeClipboardData = { nodes: Node[]; rootId: number };

export type SubtreeClipboardResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "invalid" | "too-large" };

// 文字数はUTF-16コード単位（string.length）で数える。コピーと貼り付けに同じ上限を使う
export const MAX_SUBTREE_CLIPBOARD_LENGTH = 5_000_000;
export const MAX_SUBTREE_CLIPBOARD_NODES = 10_000;

const SUBTREE_CLIPBOARD_TYPE = "draw-my-map/subtree";
const SUBTREE_CLIPBOARD_VERSION = 1;

const INVALID = { ok: false, reason: "invalid" } as const;
const TOO_LARGE = { ok: false, reason: "too-large" } as const;

// 各要素をV3のノードとして検証し、既知の項目だけで作り直す。画像の高さ補正もV3と同じ規則で行う
function normalizeNodes(values: readonly unknown[]): Node[] | null {
  const nodes: Node[] = [];
  for (const [index, value] of values.entries()) {
    const normalized = normalizeMapDocumentNode(value, index, 3);
    if (!normalized.ok) return null;
    nodes.push(normalized.value);
  }
  return nodes;
}

export function validateSubtreeClipboardNodes(
  nodes: readonly Node[],
): SubtreeClipboardResult<SubtreeClipboardData> {
  if (nodes.length > MAX_SUBTREE_CLIPBOARD_NODES) return TOO_LARGE;

  let rootId: number | null = null;
  for (const node of nodes) {
    if (node.parentId !== null) continue;
    if (rootId !== null) return INVALID;
    rootId = node.id;
  }
  if (rootId === null) return INVALID;

  const graph = validateMapDocumentGraph(nodes);
  if (!graph.ok) return INVALID;
  return { ok: true, value: { nodes: graph.value, rootId } };
}

// コピー元の根と全子孫を抜き出し、根だけを親から切り離す。元の配列は変更しない
export function encodeSubtreeClipboard(
  nodes: readonly Node[],
  sourceId: number,
): SubtreeClipboardResult<string> {
  const subtreeIds = collectSubtreeIds(nodes, sourceId);
  if (subtreeIds.size > MAX_SUBTREE_CLIPBOARD_NODES) return TOO_LARGE;

  const snapshot: Node[] = [];
  for (const node of nodes) {
    if (!subtreeIds.has(node.id)) continue;
    snapshot.push(node.id === sourceId ? { ...node, parentId: null } : node);
  }

  // 貼り付けで受理できないデータはクリップボードへ出さない
  const normalized = normalizeNodes(snapshot);
  if (!normalized) return INVALID;
  const validated = validateSubtreeClipboardNodes(normalized);
  if (!validated.ok) return validated;

  const text = JSON.stringify({
    type: SUBTREE_CLIPBOARD_TYPE,
    version: SUBTREE_CLIPBOARD_VERSION,
    nodes: validated.value.nodes,
  });
  if (text.length > MAX_SUBTREE_CLIPBOARD_LENGTH) return TOO_LARGE;
  return { ok: true, value: text };
}

export function decodeSubtreeClipboard(
  text: string,
): SubtreeClipboardResult<SubtreeClipboardData> {
  if (text.length > MAX_SUBTREE_CLIPBOARD_LENGTH) return TOO_LARGE;

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return INVALID;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return INVALID;

  const record = value as Record<string, unknown>;
  if (record.type !== SUBTREE_CLIPBOARD_TYPE) return INVALID;
  if (record.version !== SUBTREE_CLIPBOARD_VERSION) return INVALID;
  if (!Array.isArray(record.nodes)) return INVALID;
  if (record.nodes.length > MAX_SUBTREE_CLIPBOARD_NODES) return TOO_LARGE;

  const nodes = normalizeNodes(record.nodes);
  if (!nodes) return INVALID;
  return validateSubtreeClipboardNodes(nodes);
}
