import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { Node } from "@/types/node";

export const MAX_NODE_SEARCH_RESULTS = 50;

export type NodeSearchMatch = {
  nodeId: number;
  label: string;
  parentLabel: string | null;
};

export type NodeSearchIndexEntry = NodeSearchMatch & {
  normalizedLabel: string;
};

export type NodeSearchIndex = readonly NodeSearchIndexEntry[];

export type NodeSearchResultSet = {
  matches: NodeSearchMatch[];
  total: number;
};

export function normalizeNodeSearchText(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function normalizeNodeSearchQuery(query: string): string {
  return normalizeNodeSearchText(query).trim();
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
  }));
}

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
    if (!entry.normalizedLabel.includes(normalizedQuery)) continue;

    total += 1;
    if (matches.length < limit) {
      const { nodeId, label, parentLabel } = entry;
      matches.push({ nodeId, label, parentLabel });
    }
  }

  return { matches, total };
}
