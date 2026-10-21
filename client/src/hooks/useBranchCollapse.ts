import { useCallback, useMemo, useState } from "react";

import {
  canCollapse,
  createNodeCollapseIndex,
  deriveNodeCollapse,
  expandCollapsedNodes,
  normalizeCollapsedNodeIds,
  toggleCollapsedNode,
  type NodeCollapseIndex,
} from "@/domain/nodes/nodeCollapse";
import type { Node } from "@/types/node";

type BranchCollapseState = {
  documentRevision: number;
  ids: ReadonlySet<number>;
};

type UseBranchCollapseParams = {
  nodes: readonly Node[];
  documentRevision: number;
};

type UseBranchCollapseResult = {
  index: NodeCollapseIndex | null;
  collapsedNodeIds: ReadonlySet<number>;
  collapseVisibleNodeIds: ReadonlySet<number>;
  hiddenCountById: ReadonlyMap<number, number>;
  canToggle: (nodeId: number) => boolean;
  toggle: (nodeId: number) => void;
  expandNodes: (nodeIds: readonly number[]) => void;
};

function normalizeState(
  state: BranchCollapseState,
  documentRevision: number,
  index: NodeCollapseIndex | null,
): BranchCollapseState {
  if (state.documentRevision !== documentRevision || !index) {
    if (state.documentRevision === documentRevision && state.ids.size === 0) return state;
    return { documentRevision, ids: new Set() };
  }
  const validIds = normalizeCollapsedNodeIds(index, state.ids);
  if (validIds === state.ids) return state;
  return { documentRevision, ids: validIds };
}

/** 正規化済みの閉ID集合に遷移を適用する。集合が変わらなければ正規化済みの状態参照を返す。 */
function transitionState(
  current: BranchCollapseState,
  documentRevision: number,
  index: NodeCollapseIndex,
  transition: (ids: ReadonlySet<number>) => ReadonlySet<number>,
): BranchCollapseState {
  const normalized = normalizeState(current, documentRevision, index);
  const ids = transition(normalized.ids);
  return ids === normalized.ids ? normalized : { documentRevision, ids };
}

export function useBranchCollapse({
  nodes,
  documentRevision,
}: UseBranchCollapseParams): UseBranchCollapseResult {
  const index = useMemo(() => createNodeCollapseIndex(nodes), [nodes]);
  const [state, setState] = useState<BranchCollapseState>(() => ({
    documentRevision,
    ids: new Set(),
  }));

  const normalizedState = normalizeState(state, documentRevision, index);
  if (normalizedState !== state) setState(normalizedState);

  const derived = useMemo(() => (
    index
      ? deriveNodeCollapse(index, normalizedState.ids)
      : {
          collapsedNodeIds: new Set<number>(),
          visibleNodeIds: new Set(nodes.map((node) => node.id)),
          hiddenCountById: new Map<number, number>(),
        }
  ), [index, nodes, normalizedState.ids]);

  const canToggle = useCallback(
    (nodeId: number) => index !== null && canCollapse(index, nodeId),
    [index],
  );

  const toggle = useCallback(
    (nodeId: number) => {
      if (!index) return;
      setState((current) => transitionState(
        current, documentRevision, index, (ids) => toggleCollapsedNode(index, ids, nodeId),
      ));
    },
    [documentRevision, index],
  );

  const expandNodes = useCallback(
    (nodeIds: readonly number[]) => {
      if (!index) return;
      setState((current) => transitionState(
        current, documentRevision, index, (ids) => expandCollapsedNodes(ids, nodeIds),
      ));
    },
    [documentRevision, index],
  );

  return {
    index,
    collapsedNodeIds: derived.collapsedNodeIds,
    collapseVisibleNodeIds: derived.visibleNodeIds,
    hiddenCountById: derived.hiddenCountById,
    canToggle,
    toggle,
    expandNodes,
  };
}
