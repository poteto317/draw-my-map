import { useMemo, useState } from "react";
import * as nodeLabelSearch from "@/domain/search/nodeLabelSearch";
import type { Node } from "@/types/node";
import type { NodeSearchListItem } from "@/types/nodeSearch";

type UseNodeLabelSearchOptions = {
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
};

export function useNodeLabelSearch({
  nodes,
  visibleNodeIds,
}: UseNodeLabelSearchOptions) {
  const [query, setQuery] = useState("");
  const index = useMemo(
    () => nodeLabelSearch.createNodeSearchIndex(nodes),
    [nodes],
  );
  const result = useMemo(
    () => nodeLabelSearch.searchNodeLabels(index, query),
    [index, query],
  );
  const matches = useMemo<NodeSearchListItem[]>(
    () => result.matches.map((match) => ({
      ...match,
      hidden: !visibleNodeIds.has(match.nodeId),
    })),
    [result.matches, visibleNodeIds],
  );

  return {
    query,
    setQuery,
    hasQuery: nodeLabelSearch.normalizeNodeSearchQuery(query) !== "",
    matches,
    total: result.total,
  };
}
