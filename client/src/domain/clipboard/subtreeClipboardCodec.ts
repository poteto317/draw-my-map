import { normalizeGroups, normalizeRelations } from "@/domain/map/relationGroupModel";
import { remapClosedForNodeIdMap } from "@/domain/map/relationGroupLifecycle";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import { isRecord } from "@/domain/shared/unknownRecord";
import { remapClosedBranchLayouts } from "@/domain/map/branchLayoutLifecycle";
import {
  normalizeBranchLayouts,
  projectBranchLayouts,
  type BranchLayout,
} from "@/types/branchLayout";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

// 正規化済みの単一の部分木。rootIdは唯一の根から求めた値で、クリップボードの形式には含めない
export type SubtreeClipboardData = {
  nodes: Node[];
  rootId: number;
  relations?: readonly MapRelation[];
  groups?: readonly MapGroup[];
  branchLayouts?: readonly BranchLayout[];
};

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

function withClosedSlice(
  data: SubtreeClipboardData,
  relations: readonly MapRelation[] | undefined,
  groups: readonly MapGroup[] | undefined,
  branchLayouts: readonly BranchLayout[] | undefined,
): SubtreeClipboardData {
  return {
    ...data,
    ...(relations === undefined ? {} : { relations }),
    ...(groups === undefined ? {} : { groups }),
    ...(branchLayouts === undefined ? {} : { branchLayouts }),
  };
}

export function validateSubtreeClipboardNodes(
  nodes: readonly Node[],
  relationsRaw?: unknown,
  groupsRaw?: unknown,
  branchLayoutsRaw?: unknown,
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
  const nodeIdSet = new Set(graph.value.map((node) => node.id));
  const relations = normalizeRelations(relationsRaw, nodeIdSet);
  const reservedEntityIds = new Set(nodeIdSet);
  for (const relation of relations ?? []) reservedEntityIds.add(relation.id);
  const groups = normalizeGroups(groupsRaw, nodeIdSet, reservedEntityIds);
  const branchLayouts = normalizeBranchLayouts(branchLayoutsRaw, nodeIdSet);
  return {
    ok: true,
    value: withClosedSlice({ nodes: graph.value, rootId }, relations, groups, branchLayouts),
  };
}

// コピー元の根と全子孫を抜き出し、根だけを親から切り離す。閉じた relation/group/branchLayouts だけ同行する。元の配列は変更しない
export function encodeSubtreeClipboard(
  nodes: readonly Node[],
  sourceId: number,
  slice?: Pick<NodeMapState, "relations" | "groups" | "branchLayouts">,
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
  const identityMap = new Map<number, number>();
  for (const id of subtreeIds) identityMap.set(id, id);
  const closed = remapClosedForNodeIdMap(slice?.relations, slice?.groups, identityMap);
  const closedBranchLayouts = remapClosedBranchLayouts(slice?.branchLayouts, identityMap);
  const validated = validateSubtreeClipboardNodes(
    normalized,
    closed.relations,
    closed.groups,
    closedBranchLayouts,
  );
  if (!validated.ok) return validated;

  const text = JSON.stringify({
    type: SUBTREE_CLIPBOARD_TYPE,
    version: SUBTREE_CLIPBOARD_VERSION,
    nodes: validated.value.nodes,
    ...(validated.value.relations === undefined ? {} : { relations: validated.value.relations }),
    ...(validated.value.groups === undefined ? {} : { groups: validated.value.groups }),
    ...projectBranchLayouts(validated.value.branchLayouts),
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
  if (!isRecord(value)) return INVALID;

  const record = value;
  if (record.type !== SUBTREE_CLIPBOARD_TYPE) return INVALID;
  if (record.version !== SUBTREE_CLIPBOARD_VERSION) return INVALID;
  if (!Array.isArray(record.nodes)) return INVALID;
  if (record.nodes.length > MAX_SUBTREE_CLIPBOARD_NODES) return TOO_LARGE;

  const nodes = normalizeNodes(record.nodes);
  if (!nodes) return INVALID;
  return validateSubtreeClipboardNodes(
    nodes,
    record.relations,
    record.groups,
    record.branchLayouts,
  );
}
