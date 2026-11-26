import { isRecord } from "@/domain/shared/unknownRecord";

export const MAP_LEARN_VERSION = 1 as const;
export const MAP_LEARN_CARD_MAX = 100;
export const MAP_REVIEW_CARD_TEXT_MAX_CODEPOINTS = 500;
export const MAP_REVIEW_CARD_SOURCE_MAX = 3;

export type MapReviewCard = {
  id: string;
  prompt: string;
  answer: string;
  sourceNodeIds: readonly number[];
};

export type MapLearnState = {
  version: typeof MAP_LEARN_VERSION;
  revealedNodeIds: readonly number[];
  cards?: readonly MapReviewCard[];
};

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function isSafeNodeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizeReviewText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0 || codePointLength(text) > MAP_REVIEW_CARD_TEXT_MAX_CODEPOINTS) return null;
  return text;
}

function normalizeCardId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

function normalizeSourceNodeIds(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    if (!isSafeNodeId(entry) || seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
    if (ids.length >= MAP_REVIEW_CARD_SOURCE_MAX) break;
  }
  if (ids.length === 0) return null;
  return ids;
}

function parseReviewCard(raw: unknown): MapReviewCard | null {
  if (!isRecord(raw)) return null;
  const id = normalizeCardId(raw.id);
  const prompt = normalizeReviewText(raw.prompt);
  const answer = normalizeReviewText(raw.answer);
  const sourceNodeIds = normalizeSourceNodeIds(raw.sourceNodeIds);
  if (id === null || prompt === null || answer === null || sourceNodeIds === null) return null;
  return { id, prompt, answer, sourceNodeIds };
}

function normalizeRevealedNodeIds(raw: unknown): readonly number[] {
  if (!Array.isArray(raw)) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    if (!isSafeNodeId(entry) || seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
  }
  return ids;
}

export function normalizeLearn(raw: unknown): MapLearnState | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (!isRecord(raw)) return undefined;
  if (raw.version !== MAP_LEARN_VERSION) return undefined;

  const revealedNodeIds = normalizeRevealedNodeIds(raw.revealedNodeIds);
  let cards: MapReviewCard[] | undefined;
  if (Array.isArray(raw.cards)) {
    const parsed: MapReviewCard[] = [];
    for (const entry of raw.cards) {
      if (parsed.length >= MAP_LEARN_CARD_MAX) break;
      const card = parseReviewCard(entry);
      if (card === null) continue;
      parsed.push(card);
    }
    if (parsed.length > 0) cards = parsed;
  }

  if (revealedNodeIds.length === 0 && cards === undefined) return undefined;
  return {
    version: MAP_LEARN_VERSION,
    revealedNodeIds,
    ...(cards === undefined ? {} : { cards }),
  };
}

export function projectLearn(
  learn: MapLearnState | undefined,
): { learn?: MapLearnState } {
  if (learn === undefined) return {};
  if (learn.revealedNodeIds.length === 0 && learn.cards === undefined) return {};
  return {
    learn: {
      version: MAP_LEARN_VERSION,
      revealedNodeIds: learn.revealedNodeIds,
      ...(learn.cards === undefined ? {} : { cards: learn.cards }),
    },
  };
}

function sortedNumberListEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function reviewCardFieldsEqual(left: MapReviewCard, right: MapReviewCard): boolean {
  return (
    left.id === right.id
    && left.prompt === right.prompt
    && left.answer === right.answer
    && sortedNumberListEqual(left.sourceNodeIds, right.sourceNodeIds)
  );
}

export function areMapLearnsEqual(
  a: MapLearnState | undefined,
  b: MapLearnState | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.version !== b.version) return false;
  if (!sortedNumberListEqual(a.revealedNodeIds, b.revealedNodeIds)) return false;

  const cardsA = a.cards;
  const cardsB = b.cards;
  if (cardsA === undefined && cardsB === undefined) return true;
  if (cardsA === undefined || cardsB === undefined) return false;
  if (cardsA.length !== cardsB.length) return false;
  return cardsA.every((card, index) => reviewCardFieldsEqual(card, cardsB[index]!));
}