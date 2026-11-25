import { excerptText } from "@/domain/aiAssist/aiBranchInput";
import { moveNodeBranch } from "@/domain/nodes/nodeBranchMove";
import { isNodeImportanceValue } from "@/domain/nodes/nodeImportance";
import { DEFAULT_LAYOUT_NODE_FOREST_OPTIONS } from "@/domain/nodes/nodeAutoLayout";
import { planNodeMerge } from "@/domain/nodes/nodeMerge";
import { MERGE_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import { reorderAllSiblings } from "@/domain/nodes/reorderAllSiblings";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import { hasOnlyKeys, hasOwn, isPlainRecord } from "@/domain/shared/unknownRecord";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export const AI_SUMMARY_MAX_LENGTH = 400;
// 重要度の理由は表示専用（保存しない）。超えたら excerptText で切る
export const AI_REASON_DISPLAY_MAX_LENGTH = 30;

export const AI_STRUCTURE_LABEL_MAX_LENGTH = 80;
export const AI_STRUCTURE_ITEM_MAX_COUNT = 20;
export const AI_CLASSIFY_MOVE_MAX_COUNT = 30;
export const AI_DUPLICATE_REASON_MAX_LENGTH = 30;

const SUMMARY_KEYS: ReadonlySet<string> = new Set(["summary"]);
const IMPORTANCE_KEYS: ReadonlySet<string> = new Set(["suggestions"]);
const SUGGESTION_KEYS: ReadonlySet<string> = new Set(["id", "importance", "reason"]);
const CHILD_CANDIDATES_KEYS: ReadonlySet<string> = new Set(["candidates"]);
const CHILD_CANDIDATE_KEYS: ReadonlySet<string> = new Set(["label"]);
const MISSING_KEYS: ReadonlySet<string> = new Set(["items"]);
const MISSING_ITEM_KEYS: ReadonlySet<string> = new Set(["label", "placement"]);
const CLASSIFY_KEYS: ReadonlySet<string> = new Set(["moves"]);
const DUPLICATES_KEYS: ReadonlySet<string> = new Set(["pairs"]);
const DUPLICATE_PAIR_KEYS: ReadonlySet<string> = new Set(["primaryId", "secondaryId", "reason"]);

export type ImportanceSuggestion = { id: number; importance: NodeImportance; reason: string };
export type ChildCandidate = { label: string };
export type MissingPerspectiveItem = { label: string; placement: "child" | "sibling" };
export type AiClassifyReparentMove = { type: "reparent"; nodeId: number; newParentId: number };
export type AiClassifyReorderMove = { type: "reorder"; parentId: number; childIds: number[] };
export type AiClassifyMove = AiClassifyReparentMove | AiClassifyReorderMove;
export type DuplicatePair = { primaryId: number; secondaryId: number; reason: string };

// C0・DEL・C1 の制御文字を除く。keepNewline なら LF だけ残す（正規表現の制御文字を避けて 1 文字ずつ見る）
function stripControlCharacters(value: string, keepNewline: boolean): string {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    if (isControl && !(keepNewline && code === 0x0a)) continue;
    result += character;
  }
  return result;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function normalizeAiSummary(value: string): string {
  return stripControlCharacters(value, true).replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeAiStructureLabel(value: string): string | null {
  const label = stripControlCharacters(value, false).trim();
  if (label === "" || label.length > AI_STRUCTURE_LABEL_MAX_LENGTH) return null;
  return label;
}

function readAiStructureLabel(item: unknown): string | null {
  if (!isPlainRecord(item) || !hasOnlyKeys(item, CHILD_CANDIDATE_KEYS)) return null;
  if (!hasOwn(item, "label") || typeof item.label !== "string") return null;
  return normalizeAiStructureLabel(item.label);
}

// 正規化の後に空と上限を判定する（L-633）
export function validateBranchSummaryOutput(value: unknown): { ok: true; summary: string } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, SUMMARY_KEYS)) return { ok: false };
  if (typeof value.summary !== "string") return { ok: false };
  const summary = normalizeAiSummary(value.summary);
  if (summary === "" || summary.length > AI_SUMMARY_MAX_LENGTH) return { ok: false };
  return { ok: true, summary };
}

export function validateImportanceOutput(
  value: unknown,
  targetIds: readonly number[],
): { ok: true; suggestions: ImportanceSuggestion[] } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, IMPORTANCE_KEYS)) return { ok: false };
  if (!Array.isArray(value.suggestions)) return { ok: false };
  const targets = new Set(targetIds);
  const seen = new Set<number>();
  const suggestions: ImportanceSuggestion[] = [];
  for (const item of value.suggestions) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, SUGGESTION_KEYS)) return { ok: false };
    if (!hasOwn(item, "id") || !hasOwn(item, "importance") || !hasOwn(item, "reason")) return { ok: false };
    const { id, importance, reason } = item;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || !targets.has(id) || seen.has(id)) return { ok: false };
    if (!isNodeImportanceValue(importance) || typeof reason !== "string") return { ok: false };
    seen.add(id);
    suggestions.push({
      id,
      importance,
      reason: excerptText(stripControlCharacters(reason, false).trim(), AI_REASON_DISPLAY_MAX_LENGTH),
    });
  }
  return { ok: true, suggestions };
}

export function validateChildCandidatesOutput(
  value: unknown,
): { ok: true; candidates: ChildCandidate[] } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, CHILD_CANDIDATES_KEYS)) return { ok: false };
  if (!Array.isArray(value.candidates)) return { ok: false };
  if (value.candidates.length === 0 || value.candidates.length > AI_STRUCTURE_ITEM_MAX_COUNT) return { ok: false };
  const candidates: ChildCandidate[] = [];
  for (const item of value.candidates) {
    const label = readAiStructureLabel(item);
    if (label === null) return { ok: false };
    candidates.push({ label });
  }
  return { ok: true, candidates };
}

export function validateMissingPerspectivesOutput(
  value: unknown,
  rootHasParent: boolean,
): { ok: true; items: MissingPerspectiveItem[] } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, MISSING_KEYS)) return { ok: false };
  if (!Array.isArray(value.items)) return { ok: false };
  if (value.items.length === 0 || value.items.length > AI_STRUCTURE_ITEM_MAX_COUNT) return { ok: false };
  const items: MissingPerspectiveItem[] = [];
  for (const item of value.items) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, MISSING_ITEM_KEYS)) return { ok: false };
    if (!hasOwn(item, "label") || !hasOwn(item, "placement")) return { ok: false };
    const label = normalizeAiStructureLabel(typeof item.label === "string" ? item.label : "");
    if (label === null) return { ok: false };
    const placement = item.placement;
    if (placement !== "child" && placement !== "sibling") return { ok: false };
    if (placement === "sibling" && !rootHasParent) continue;
    items.push({ label, placement });
  }
  if (items.length === 0) return { ok: false };
  return { ok: true, items };
}

function branchChildren(parentId: number, nodes: readonly Node[], branchIds: ReadonlySet<number>): number[] {
  return nodes.filter((node) => node.parentId === parentId && branchIds.has(node.id)).map((node) => node.id);
}

function sameIdMultiset(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<number, number>();
  for (const id of a) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const id of b) {
    const next = (counts.get(id) ?? 0) - 1;
    if (next < 0) return false;
    if (next === 0) counts.delete(id);
    else counts.set(id, next);
  }
  return counts.size === 0;
}

function nodeById(nodes: readonly Node[], id: number): Node | undefined {
  return nodes.find((node) => node.id === id);
}

function isValidReparentMove(
  move: { nodeId: number; newParentId: number },
  branchIds: ReadonlySet<number>,
  nodes: readonly Node[],
): boolean {
  const { nodeId, newParentId } = move;
  if (!branchIds.has(nodeId) || !branchIds.has(newParentId) || nodeId === newParentId) return false;
  const subtree = collectSubtreeIds(nodes, nodeId);
  if (subtree.has(newParentId)) return false;
  const target = nodeById(nodes, nodeId);
  const parent = nodeById(nodes, newParentId);
  if (target === undefined || parent === undefined) return false;
  if (target.locked === true || parent.locked === true) return false;
  return true;
}

function isValidReorderMove(
  move: { parentId: number; childIds: number[] },
  branchIds: ReadonlySet<number>,
  nodes: readonly Node[],
): boolean {
  const { parentId, childIds } = move;
  if (!branchIds.has(parentId)) return false;
  const parent = nodeById(nodes, parentId);
  if (parent === undefined || parent.locked === true) return false;
  if (childIds.length === 0 || childIds.length > branchChildren(parentId, nodes, branchIds).length) return false;
  if (!childIds.every((id) => isSafeInteger(id) && branchIds.has(id))) return false;
  if (new Set(childIds).size !== childIds.length) return false;
  if (childIds.some((id) => nodeById(nodes, id)?.locked === true)) return false;
  return sameIdMultiset(childIds, branchChildren(parentId, nodes, branchIds));
}

function readClassifyMove(item: unknown): AiClassifyMove | null {
  if (!isPlainRecord(item) || !hasOwn(item, "type")) return null;
  if (item.type === "reparent") {
    if (!hasOnlyKeys(item, new Set(["type", "nodeId", "newParentId"]))) return null;
    const { nodeId, newParentId } = item;
    if (!isSafeInteger(nodeId) || !isSafeInteger(newParentId)) return null;
    return { type: "reparent", nodeId, newParentId };
  }
  if (item.type === "reorder") {
    if (!hasOnlyKeys(item, new Set(["type", "parentId", "childIds"]))) return null;
    const { parentId, childIds } = item;
    if (!isSafeInteger(parentId) || !Array.isArray(childIds)) return null;
    if (!childIds.every((id) => isSafeInteger(id))) return null;
    return { type: "reorder", parentId, childIds };
  }
  return null;
}

function tryApplyClassifyMove(
  nodes: readonly Node[],
  move: AiClassifyMove,
  branchIds: ReadonlySet<number>,
): readonly Node[] | null {
  if (move.type === "reparent") {
    if (!isValidReparentMove(move, branchIds, nodes)) return null;
    const moved = moveNodeBranch(
      nodes,
      move.nodeId,
      move.newParentId,
      "manual",
      DEFAULT_LAYOUT_SPACING,
      DEFAULT_LAYOUT_NODE_FOREST_OPTIONS,
    );
    return moved.ok ? moved.nodes : null;
  }
  if (!isValidReorderMove(move, branchIds, nodes)) return null;
  const reordered = reorderAllSiblings(
    nodes,
    move.parentId,
    move.childIds,
    "manual",
    DEFAULT_LAYOUT_NODE_FOREST_OPTIONS,
  );
  if (!reordered.ok) {
    if (reordered.reason === "unchanged") return nodes;
    return null;
  }
  return reordered.nodes;
}

// 構文不正な move は importance と同様に黙って除外する。意味不正は除外し、apply 順（reparent → reorder）で仮適用できない組み合わせも除外。残り 0 件なら不正。
export function validateClassifyReorderOutput(
  value: unknown,
  branchIds: ReadonlySet<number>,
  nodes: readonly Node[],
): { ok: true; moves: AiClassifyMove[] } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, CLASSIFY_KEYS)) return { ok: false };
  if (!Array.isArray(value.moves)) return { ok: false };
  if (value.moves.length === 0 || value.moves.length > AI_CLASSIFY_MOVE_MAX_COUNT) return { ok: false };
  const candidates: { move: AiClassifyMove; originalIndex: number }[] = [];
  value.moves.forEach((item, originalIndex) => {
    const move = readClassifyMove(item);
    if (move !== null) candidates.push({ move, originalIndex });
  });
  const sorted = [...candidates].sort((left, right) => {
    const leftSort = left.move.type === "reparent" ? 0 : 1;
    const rightSort = right.move.type === "reparent" ? 0 : 1;
    return leftSort - rightSort || left.originalIndex - right.originalIndex;
  });

  let working: readonly Node[] = nodes;
  const acceptedIndices = new Set<number>();
  for (const { move, originalIndex } of sorted) {
    const next = tryApplyClassifyMove(working, move, branchIds);
    if (next === null) continue;
    working = next;
    acceptedIndices.add(originalIndex);
  }

  const moves = candidates
    .filter((candidate) => acceptedIndices.has(candidate.originalIndex))
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map((candidate) => candidate.move);
  if (moves.length === 0) return { ok: false };
  return { ok: true, moves };
}

export type AiDuplicatesMergeContext = {
  readonly nodes: readonly Node[];
  readonly visibleNodeIds: ReadonlySet<number>;
  readonly currentMapId: string;
};

function readDuplicateReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  return excerptText(stripControlCharacters(reason, false).trim(), AI_DUPLICATE_REASON_MAX_LENGTH);
}

export function validateDuplicatesOutput(
  value: unknown,
  branchIds: ReadonlySet<number>,
  mergeCtx: AiDuplicatesMergeContext,
): { ok: true; pairs: DuplicatePair[] } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, DUPLICATES_KEYS)) return { ok: false };
  if (!Array.isArray(value.pairs)) return { ok: false };
  if (value.pairs.length === 0 || value.pairs.length > AI_STRUCTURE_ITEM_MAX_COUNT) return { ok: false };
  const pairs: DuplicatePair[] = [];
  for (const item of value.pairs) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, DUPLICATE_PAIR_KEYS)) return { ok: false };
    if (!hasOwn(item, "primaryId") || !hasOwn(item, "secondaryId") || !hasOwn(item, "reason")) return { ok: false };
    const { primaryId, secondaryId, reason } = item;
    if (!isSafeInteger(primaryId) || !isSafeInteger(secondaryId) || primaryId === secondaryId) continue;
    if (!branchIds.has(primaryId) || !branchIds.has(secondaryId)) continue;
    const primary = nodeById(mergeCtx.nodes, primaryId);
    const secondary = nodeById(mergeCtx.nodes, secondaryId);
    if (primary === undefined || secondary === undefined) continue;
    if (primary.locked === true || secondary.locked === true) continue;
    const normalizedReason = readDuplicateReason(reason);
    if (normalizedReason === null) continue;
    const plan = planNodeMerge(
      mergeCtx.nodes,
      [primaryId, secondaryId],
      primaryId,
      MERGE_DEFAULT_SEPARATOR,
      mergeCtx.visibleNodeIds,
      mergeCtx.currentMapId,
    );
    if (!plan.ok) continue;
    pairs.push({ primaryId, secondaryId, reason: normalizedReason });
  }
  if (pairs.length === 0) return { ok: false };
  return { ok: true, pairs };
}
