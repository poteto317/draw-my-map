import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { Node } from "@/types/node";

export const MAX_NODE_SEARCH_RESULTS = 50;

export type NodeSearchMatch = {
  nodeId: number;
  label: string;
  parentLabel: string | null;
  // ラベルで一致したか、URL だけで一致したか（ラベルと URL の両方に一致すればラベル）
  matchedBy: "label" | "link";
};

// 索引の段階では、どちらで一致するかは決まらない（matchedBy は検索結果を作るときに付ける）
export type NodeSearchIndexEntry = Omit<NodeSearchMatch, "matchedBy"> & {
  normalizedLabel: string;
  // URL ごとの正規化した文字列（エンコードのままと、decodeURI で戻した形）。URL が無ければ空
  normalizedLinks: readonly string[];
};

export type NodeSearchIndex = readonly NodeSearchIndexEntry[];

export type NodeSearchResultSet = {
  matches: NodeSearchMatch[];
  total: number;
};

const NO_NORMALIZED_LINKS: readonly string[] = Object.freeze([]);

// links の配列の参照を鍵にして、正規化の結果を使い回す（索引はノードが変わるたびに作り直されるが、
// links が変わらないノードでは decodeURI と正規化を繰り返さない）
const normalizedLinksCache = new WeakMap<readonly string[], readonly string[]>();

export function normalizeNodeSearchText(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function normalizeNodeSearchQuery(query: string): string {
  return normalizeNodeSearchText(query).trim();
}

// パーセントエンコードを戻した形。不正なパーセントエンコードで decodeURI が例外を投げるときは null
function decodeLinkForSearch(url: string): string | null {
  try {
    return decodeURI(url);
  } catch {
    return null;
  }
}

function normalizeNodeLinksForSearch(links: readonly string[] | undefined): readonly string[] {
  if (links === undefined || links.length === 0) return NO_NORMALIZED_LINKS;
  const cached = normalizedLinksCache.get(links);
  if (cached !== undefined) return cached;

  const normalized = new Set<string>();
  for (const url of links) {
    normalized.add(normalizeNodeSearchText(url));
    const decoded = decodeLinkForSearch(url);
    if (decoded !== null) normalized.add(normalizeNodeSearchText(decoded));
  }
  const result = Object.freeze([...normalized]);
  normalizedLinksCache.set(links, result);
  return result;
}

export function createNodeSearchIndex(nodes: readonly Node[]): NodeSearchIndex {
  const displayLabelsById = new Map<number, string>();
  for (const node of nodes) {
    displayLabelsById.set(node.id, getNodeDisplayLabel(node.label));
  }

  return nodes.map((node) => ({
    nodeId: node.id,
    label: getNodeDisplayLabel(node.label),
    parentLabel: node.parentId === null ? null : displayLabelsById.get(node.parentId) ?? null,
    normalizedLabel: node.label === "" ? "" : normalizeNodeSearchText(node.label),
    normalizedLinks: normalizeNodeLinksForSearch(node.links),
  }));
}

function findMatchedBy(entry: NodeSearchIndexEntry, normalizedQuery: string): NodeSearchMatch["matchedBy"] | null {
  if (entry.normalizedLabel.includes(normalizedQuery)) return "label";
  // URL ごとに別の要素なので、URL の区切りをまたいで一致しない
  if (entry.normalizedLinks.some((link) => link.includes(normalizedQuery))) return "link";
  return null;
}

// ラベルと URL（ノードの links）を検索する。名前は互換のため変えない
export function searchNodeLabels(
  index: NodeSearchIndex,
  query: string,
  limit: number = MAX_NODE_SEARCH_RESULTS
): NodeSearchResultSet {
  const normalizedQuery = normalizeNodeSearchQuery(query);
  if (normalizedQuery === "") return { matches: [], total: 0 };

  const matches: NodeSearchMatch[] = [];
  let total = 0;

  for (const entry of index) {
    const matchedBy = findMatchedBy(entry, normalizedQuery);
    if (matchedBy === null) continue;

    total += 1;
    if (matches.length < limit) {
      const { nodeId, label, parentLabel } = entry;
      matches.push({ nodeId, label, parentLabel, matchedBy });
    }
  }

  return { matches, total };
}
