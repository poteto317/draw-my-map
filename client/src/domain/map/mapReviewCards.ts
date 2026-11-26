import { indexNodeForest, type IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { normalizeNodeNote } from "@/domain/nodes/nodeNote";
import {
  MAP_REVIEW_CARD_TEXT_MAX_CODEPOINTS,
  type MapReviewCard,
} from "@/types/mapLearn";
import type { Node } from "@/types/node";

export const MAP_REVIEW_CARD_GENERATION_MAX = 50;

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function isWithinCardTextLimit(text: string): boolean {
  const length = codePointLength(text);
  return length >= 1 && length <= MAP_REVIEW_CARD_TEXT_MAX_CODEPOINTS;
}

function normalizeLabel(label: string): string | null {
  const trimmed = label.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function sourceKey(sourceNodeIds: readonly number[]): string {
  return [...sourceNodeIds].sort((left, right) => left - right).join(",");
}

function enumeratePreOrder(forest: IndexedNodeForest): readonly Node[] {
  const ordered: Node[] = [];
  const stack: Node[] = [...forest.roots].reverse();
  while (stack.length > 0) {
    const current = stack.pop()!;
    ordered.push(current);
    const children = forest.childrenByParent.get(current.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }
  return ordered;
}

function allocateCardId(kind: "pc" | "memo", sourceNodeIds: readonly number[]): string {
  return `learn-${kind}-${sourceNodeIds.join("-")}`;
}

type Candidate = Omit<MapReviewCard, "id">;

function tryPush(
  out: MapReviewCard[],
  usedSources: Set<string>,
  candidate: Candidate,
  kind: "pc" | "memo",
): void {
  if (out.length >= MAP_REVIEW_CARD_GENERATION_MAX) return;
  if (!isWithinCardTextLimit(candidate.prompt) || !isWithinCardTextLimit(candidate.answer)) return;
  const key = sourceKey(candidate.sourceNodeIds);
  if (usedSources.has(key)) return;
  usedSources.add(key);
  out.push({
    id: allocateCardId(kind, candidate.sourceNodeIds),
    ...candidate,
  });
}

export function generateReviewCards(nodes: readonly Node[]): readonly MapReviewCard[] {
  const forest = indexNodeForest(nodes);
  if (forest === null) return [];

  const ordered = enumeratePreOrder(forest);
  const nodesById = new Map(nodes.map((entry) => [entry.id, entry]));
  const cards: MapReviewCard[] = [];
  const usedSources = new Set<string>();

  for (const child of ordered) {
    if (child.parentId === null) continue;
    const parent = nodesById.get(child.parentId);
    if (parent === undefined) continue;
    const parentLabel = normalizeLabel(parent.label);
    const childLabel = normalizeLabel(child.label);
    if (parentLabel === null || childLabel === null) continue;
    tryPush(cards, usedSources, {
      prompt: `「${parentLabel}」の下にある項目は？`,
      answer: childLabel,
      sourceNodeIds: [parent.id, child.id],
    }, "pc");
  }

  for (const entry of ordered) {
    const note = normalizeNodeNote(entry.note ?? "");
    if (note === undefined) continue;
    if (!isWithinCardTextLimit(note)) continue;
    const label = normalizeLabel(entry.label);
    const prompt = label === null
      ? "このノードのメモの要点は？"
      : `「${label}」のメモの要点は？`;
    tryPush(cards, usedSources, {
      prompt,
      answer: note,
      sourceNodeIds: [entry.id],
    }, "memo");
  }

  return cards;
}