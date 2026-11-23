import type {
  CrossMapCorpus,
  UnreadableMapInfo,
} from "@/domain/mapLibrary/crossMapCorpus";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import {
  normalizeNodeSearchQuery,
  normalizeNodeSearchText,
} from "@/domain/search/nodeLabelSearch";
import type { Node } from "@/types/node";

export const MAX_CROSS_MAP_SEARCH_RESULTS = 100;

const MAX_NOTE_SNIPPET_LENGTH = 80;

export type CrossMapSearchMatchField =
  | "label"
  | "note"
  | "tag"
  | "link"
  | "source";

export type CrossMapSearchMatch = {
  readonly mapId: string;
  readonly mapName: string;
  readonly isCurrentMap: boolean;
  readonly isMapArchived: boolean;
  readonly nodeId: number;
  readonly label: string;
  readonly parentLabel: string | null;
  readonly matchedBy: CrossMapSearchMatchField;
  readonly snippet?: string;
};

export type CrossMapSearchResult = {
  readonly matches: readonly CrossMapSearchMatch[];
  readonly total: number;
  readonly matchedMapCount: number;
  readonly unreadableMaps: readonly UnreadableMapInfo[];
};

type NodeFieldMatch = {
  readonly matchedBy: CrossMapSearchMatchField;
  readonly snippet?: string;
};

function decodeUrlSafely(url: string): string | null {
  try {
    return decodeURI(url);
  } catch {
    return null;
  }
}

function matchesUrl(url: string, normalizedQuery: string): boolean {
  if (normalizeNodeSearchText(url).includes(normalizedQuery)) {
    return true;
  }
  const decoded = decodeUrlSafely(url);
  return decoded !== null && normalizeNodeSearchText(decoded).includes(normalizedQuery);
}

function findMatchCodePointRange(
  codePoints: readonly string[],
  normalizedQuery: string,
  normStart: number,
): { start: number; end: number } {
  // normalizeNodeSearchText(codePoints[0..mid]).length <= normStart を満たす最大 mid
  let lo = 0;
  let hi = codePoints.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const prefixLength = normalizeNodeSearchText(
      codePoints.slice(0, mid).join(""),
    ).length;
    if (prefixLength <= normStart) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const start = lo;

  // codePoints[start..mid] の正規化結果が normalizedQuery を含む最小 mid
  let endLo = Math.min(start + 1, codePoints.length);
  let endHi = codePoints.length;
  while (endLo < endHi) {
    const mid = Math.floor((endLo + endHi) / 2);
    if (
      normalizeNodeSearchText(codePoints.slice(start, mid).join("")).includes(
        normalizedQuery,
      )
    ) {
      endHi = mid;
    } else {
      endLo = mid + 1;
    }
  }

  return { start, end: endLo };
}

function formatSnippetText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, " ");
}

function extractNoteSnippet(
  note: string,
  normalizedQuery: string,
  normStart: number,
): string {
  const codePoints = Array.from(note);
  const total = codePoints.length;
  if (total <= MAX_NOTE_SNIPPET_LENGTH) {
    return formatSnippetText(note);
  }

  const { start: matchStart, end: matchEnd } =
    normStart < 0
      ? { start: 0, end: 0 }
      : findMatchCodePointRange(codePoints, normalizedQuery, normStart);

  const matchLength = matchEnd - matchStart;
  const bothEllipsisBudget = MAX_NOTE_SNIPPET_LENGTH - 2;
  const singleEllipsisBudget = MAX_NOTE_SNIPPET_LENGTH - 1;

  const contextBefore = Math.floor(
    Math.max(0, bothEllipsisBudget - matchLength) / 2,
  );
  let windowStart = Math.max(0, matchStart - contextBefore);
  let windowEnd: number;

  if (windowStart === 0) {
    windowEnd = Math.min(total, singleEllipsisBudget);
  } else {
    windowEnd = Math.min(total, windowStart + bothEllipsisBudget);
    if (windowEnd === total) {
      windowStart = Math.max(0, total - singleEllipsisBudget);
    }
  }

  const prefix = windowStart > 0 ? "…" : "";
  const suffix = windowEnd < total ? "…" : "";
  const body = formatSnippetText(
    codePoints.slice(windowStart, windowEnd).join(""),
  );
  return `${prefix}${body}${suffix}`;
}

function matchNodeFields(
  node: Node,
  normalizedQuery: string,
  includeSnippet: boolean,
): NodeFieldMatch | null {
  // 1. ラベル（空ラベルの代替表示文言は照合しない）
  if (
    node.label !== "" &&
    normalizeNodeSearchText(node.label).includes(normalizedQuery)
  ) {
    return { matchedBy: "label" };
  }

  // 2. 詳細メモ（正規化は 1 回のみ行い、上限超過後はスニペット生成を省略する）
  if (node.note !== undefined && node.note !== "") {
    const normStart = normalizeNodeSearchText(node.note).indexOf(
      normalizedQuery,
    );
    if (normStart >= 0) {
      return includeSnippet
        ? {
            matchedBy: "note",
            snippet: extractNoteSnippet(node.note, normalizedQuery, normStart),
          }
        : { matchedBy: "note" };
    }
  }

  // 3. タグ
  if (node.tags !== undefined) {
    for (const tag of node.tags) {
      if (normalizeNodeSearchText(tag).includes(normalizedQuery)) {
        return includeSnippet
          ? { matchedBy: "tag", snippet: tag }
          : { matchedBy: "tag" };
      }
    }
  }

  // 4. 添付リンク（元 URL と decodeURI の両方）
  if (node.links !== undefined) {
    for (const href of node.links) {
      if (matchesUrl(href, normalizedQuery)) {
        return includeSnippet
          ? { matchedBy: "link", snippet: href }
          : { matchedBy: "link" };
      }
    }
  }

  // 5. 出典（title / page / url）
  if (node.sources !== undefined) {
    for (const source of node.sources) {
      const matched =
        normalizeNodeSearchText(source.title).includes(normalizedQuery) ||
        (source.page !== undefined &&
          normalizeNodeSearchText(source.page).includes(normalizedQuery)) ||
        (source.url !== undefined && matchesUrl(source.url, normalizedQuery));
      if (matched) {
        return includeSnippet
          ? { matchedBy: "source", snippet: source.title }
          : { matchedBy: "source" };
      }
    }
  }

  return null;
}

export function searchCrossMapCorpus(
  corpus: CrossMapCorpus,
  query: string,
  limit: number = MAX_CROSS_MAP_SEARCH_RESULTS,
): CrossMapSearchResult {
  const normalizedQuery = normalizeNodeSearchQuery(query);
  if (normalizedQuery === "") {
    return {
      matches: [],
      total: 0,
      matchedMapCount: 0,
      unreadableMaps: corpus.unreadableMaps,
    };
  }

  const matches: CrossMapSearchMatch[] = [];
  let total = 0;
  let matchedMapCount = 0;

  for (const map of corpus.readableMaps) {
    const displayLabelsById = new Map<number, string>();
    for (const node of map.nodes) {
      displayLabelsById.set(node.id, getNodeDisplayLabel(node.label));
    }

    let mapHasMatch = false;

    for (const node of map.nodes) {
      const includeSnippet = matches.length < limit;
      const fieldMatch = matchNodeFields(node, normalizedQuery, includeSnippet);
      if (fieldMatch === null) continue;

      total += 1;
      mapHasMatch = true;

      if (includeSnippet) {
        const label = displayLabelsById.get(node.id) ?? getNodeDisplayLabel(node.label);
        const parentLabel =
          node.parentId === null
            ? null
            : (displayLabelsById.get(node.parentId) ?? null);
        const baseMatch = {
          mapId: map.mapId,
          mapName: map.mapName,
          isCurrentMap: map.isCurrent,
          isMapArchived: map.isArchived,
          nodeId: node.id,
          label,
          parentLabel,
          matchedBy: fieldMatch.matchedBy,
        };
        matches.push(
          fieldMatch.snippet === undefined
            ? baseMatch
            : { ...baseMatch, snippet: fieldMatch.snippet },
        );
      }
    }

    if (mapHasMatch) {
      matchedMapCount += 1;
    }
  }

  return {
    matches,
    total,
    matchedMapCount,
    unreadableMaps: corpus.unreadableMaps,
  };
}
