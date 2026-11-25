import type { AiAssistKind } from "@/domain/aiAssist/aiAssistEntryAvailability";
import { hasOnlyKeys, hasOwn, isPlainRecord } from "@/domain/shared/unknownRecord";
import { isNodeImportanceValue } from "@/domain/nodes/nodeImportance";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

// AI に送る枝の上限。数え方は string.length（UTF-16 のコード単位。詳細メモと同じ。L-858）。サーバーの検証も同じ値を使う
export const AI_SUMMARY_MAX_NODES = 200;
export const AI_IMPORTANCE_MAX_NODES = 100;
export const AI_CHILD_CANDIDATES_MAX_NODES = 80;
export const AI_MISSING_PERSPECTIVES_MAX_NODES = 80;
export const AI_CLASSIFY_REORDER_MAX_NODES = 100;
export const AI_DUPLICATES_MAX_NODES = 120;
export const AI_LABEL_EXCERPT_MAX_LENGTH = 200;
export const AI_NOTE_EXCERPT_MAX_LENGTH = 500;
export const AI_BRANCH_MAX_TOTAL_LENGTH = 40000;

const EXCERPT_ELLIPSIS = "…";
const INPUT_KEYS: ReadonlySet<string> = new Set(["rootId", "nodes"]);
const NODE_KEYS: ReadonlySet<string> = new Set(["id", "parentId", "label", "note", "importance", "locked"]);

export type AiBranchInputNode = {
  id: number;
  parentId: number | null; // 根だけ null（マップ上の親は送らない）
  label: string; // 抜粋済み
  note?: string; // 抜粋済み。無い・空白だけなら持たない
  importance: NodeImportance;
  locked?: true;
};

// nodes は先行順（兄弟はマップのノード配列の順）
export type AiBranchInput = { rootId: number; nodes: AiBranchInputNode[] };

// 不足観点の sibling 配置可否。送信・検証・サーバーが同じ判定を使う
export function aiBranchRootHasParent(branch: AiBranchInput): boolean {
  const root = branch.nodes.find((node) => node.id === branch.rootId);
  return root !== undefined && root.parentId !== null;
}

export type BuildAiBranchInputResult =
  | { ok: true; input: AiBranchInput; truncatedCount: number; totalLength: number }
  | { ok: false; reason: "node-missing" | "too-many-nodes" | "too-large" };

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

// 上限以内ならそのまま。超えるときは先頭 max - 1 単位に「…」を付ける。切り口が対になっていない上位サロゲートなら
// 1 単位削る（normalizeNodeNote と同じ保護。L-636）。結果の length は常に max 以下
export function excerptText(value: string, max: number): string {
  if (value.length <= max) return value;
  let head = value.slice(0, max - 1);
  if (head.length > 0 && isHighSurrogate(head.charCodeAt(head.length - 1))) head = head.slice(0, -1);
  return `${head}${EXCERPT_ELLIPSIS}`;
}

function hasNoteText(note: string | undefined): note is string {
  return note !== undefined && note.trim() !== "";
}

// キーの順を固定した新しいオブジェクトにする（指紋と検証の結果で同じ形にする）
function canonicalNode(node: AiBranchInputNode): AiBranchInputNode {
  const base = { id: node.id, parentId: node.parentId, label: node.label };
  const withFields = node.note === undefined
    ? { ...base, importance: node.importance }
    : { ...base, note: node.note, importance: node.importance };
  return node.locked === true ? { ...withFields, locked: true } : withFields;
}

// 根から先行順に集める。maxNodes を超えた時点で null。循環した不正な配列でも各ノードを一度だけ訪れる
function collectPreorder(nodes: readonly Node[], root: Node, maxNodes: number): Node[] | null {
  const childrenByParentId = new Map<number, Node[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const children = childrenByParentId.get(node.parentId);
    if (children) children.push(node);
    else childrenByParentId.set(node.parentId, [node]);
  }
  const ordered: Node[] = [];
  const visited = new Set<number>();
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    ordered.push(node);
    if (ordered.length > maxNodes) return null;
    const children = childrenByParentId.get(node.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return ordered;
}

// 選んだノードを根とする枝の全ノード（折りたたみ・解像度・深さで隠れたノードも含む）を、送る形にする
export function buildAiBranchInput(
  nodes: readonly Node[],
  rootId: number,
  options: { includeRootNote: boolean; maxNodes: number },
): BuildAiBranchInputResult {
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return { ok: false, reason: "node-missing" };
  const ordered = collectPreorder(nodes, root, options.maxNodes);
  if (ordered === null) return { ok: false, reason: "too-many-nodes" };

  let truncatedCount = 0;
  let totalLength = 0;
  const inputNodes = ordered.map((node): AiBranchInputNode => {
    const label = excerptText(node.label, AI_LABEL_EXCERPT_MAX_LENGTH);
    if (label !== node.label) truncatedCount += 1;
    totalLength += label.length;
    const parentId = node.id === rootId ? null : node.parentId;
    const locked = node.locked === true ? ({ locked: true as const }) : {};
    const includeNote = node.id !== rootId || options.includeRootNote;
    if (!includeNote || !hasNoteText(node.note)) {
      return canonicalNode({ id: node.id, parentId, label, importance: node.importance, ...locked });
    }
    const note = excerptText(node.note, AI_NOTE_EXCERPT_MAX_LENGTH);
    if (note !== node.note) truncatedCount += 1;
    totalLength += note.length;
    return canonicalNode({ id: node.id, parentId, label, note, importance: node.importance, ...locked });
  });

  if (totalLength > AI_BRANCH_MAX_TOTAL_LENGTH) return { ok: false, reason: "too-large" };
  return { ok: true, input: { rootId, nodes: inputNodes }, truncatedCount, totalLength };
}

export function aiBranchInputFingerprint(input: AiBranchInput): string {
  return JSON.stringify({ rootId: input.rootId, nodes: input.nodes.map(canonicalNode) });
}

function buildOptionsForKind(kind: AiAssistKind): { includeRootNote: boolean; maxNodes: number } {
  switch (kind) {
    case "branch-summary":
      return { includeRootNote: false, maxNodes: AI_SUMMARY_MAX_NODES };
    case "importance":
      return { includeRootNote: true, maxNodes: AI_IMPORTANCE_MAX_NODES };
    case "child-candidates":
      return { includeRootNote: true, maxNodes: AI_CHILD_CANDIDATES_MAX_NODES };
    case "missing-perspectives":
      return { includeRootNote: true, maxNodes: AI_MISSING_PERSPECTIVES_MAX_NODES };
    case "classify-reorder":
      return { includeRootNote: true, maxNodes: AI_CLASSIFY_REORDER_MAX_NODES };
    case "duplicates":
      return { includeRootNote: true, maxNodes: AI_DUPLICATES_MAX_NODES };
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

// 構造提案用の入力指紋。枝が大きすぎるときは null（L-018）
export function aiStructureInputFingerprintOf(
  nodes: readonly Node[],
  rootId: number,
  kind: AiAssistKind,
): string | null {
  const built = buildAiBranchInput(nodes, rootId, buildOptionsForKind(kind));
  if (!built.ok) return null;
  return aiBranchInputFingerprint(built.input);
}

// 重要度の提案の対象: 枝のうち、nodes 上でロックされていないノードの ID（先行順）
export function importanceTargetIds(input: AiBranchInput, nodes: readonly Node[]): number[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return input.nodes
    .filter((item) => {
      const node = nodesById.get(item.id);
      return node !== undefined && node.locked !== true;
    })
    .map((item) => item.id);
}

function readInputNode(value: unknown): AiBranchInputNode | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, NODE_KEYS)) return null;
  const { id, label, note, importance } = value;
  if (!isSafeInteger(id)) return null;
  // unknown のままでは複合条件で型が絞れないため、null・整数・不正（undefined）に分けて読む
  const parentId = value.parentId === null ? null : isSafeInteger(value.parentId) ? value.parentId : undefined;
  if (parentId === undefined) return null;
  if (typeof label !== "string" || label.length > AI_LABEL_EXCERPT_MAX_LENGTH) return null;
  if (!isNodeImportanceValue(importance)) return null;
  if (hasOwn(value, "locked") && value.locked !== true) return null;
  const locked = hasOwn(value, "locked") ? ({ locked: true as const }) : {};
  if (!hasOwn(value, "note")) return canonicalNode({ id, parentId, label, importance, ...locked });
  if (typeof note !== "string" || note.length > AI_NOTE_EXCERPT_MAX_LENGTH || note.trim() === "") return null;
  return canonicalNode({ id, parentId, label, note, importance, ...locked });
}

function reachesRoot(nodesById: ReadonlyMap<number, AiBranchInputNode>, startId: number): boolean {
  const seen = new Set<number>();
  let current = nodesById.get(startId);
  while (current !== undefined && current.parentId !== null) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    current = nodesById.get(current.parentId);
  }
  return current !== undefined;
}

// サーバーが受け取った本文の検証。クライアントと同じ定数・同じ数え方を使う（L-858・L-018）
export function validateAiBranchInput(
  value: unknown,
  options: { maxNodes: number },
): { ok: true; input: AiBranchInput } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, INPUT_KEYS)) return { ok: false };
  const { rootId, nodes } = value;
  if (!isSafeInteger(rootId) || !Array.isArray(nodes)) return { ok: false };
  if (nodes.length === 0 || nodes.length > options.maxNodes) return { ok: false };

  const inputNodes: AiBranchInputNode[] = [];
  for (const raw of nodes) {
    const node = readInputNode(raw);
    if (node === null) return { ok: false };
    inputNodes.push(node);
  }
  const nodesById = new Map(inputNodes.map((node) => [node.id, node]));
  if (nodesById.size !== inputNodes.length) return { ok: false };
  const roots = inputNodes.filter((node) => node.parentId === null);
  if (roots.length !== 1 || roots[0].id !== rootId) return { ok: false };
  for (const node of inputNodes) {
    if (node.parentId !== null && !nodesById.has(node.parentId)) return { ok: false };
    if (!reachesRoot(nodesById, node.id)) return { ok: false };
  }
  const totalLength = inputNodes.reduce((sum, node) => sum + node.label.length + (node.note?.length ?? 0), 0);
  if (totalLength > AI_BRANCH_MAX_TOTAL_LENGTH) return { ok: false };
  return { ok: true, input: { rootId, nodes: inputNodes } };
}
