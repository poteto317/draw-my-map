import { useCallback, useMemo, useState } from "react";
import { collectAncestorIds, collectSubtreeIds, type NodeCollapseIndex } from "@/domain/nodes/nodeCollapse";

type BranchFocus = { id: number; mapId: string; resetRevision: number };

type Options = {
  mapId: string;
  resetRevision: number;
  collapseIndex: NodeCollapseIndex | null;
  expandNodes: (ids: readonly number[]) => void;
};

export function useBranchFocus({ mapId, resetRevision, collapseIndex, expandNodes }: Options) {
  const [branchFocus, setBranchFocus] = useState<BranchFocus | null>(null);
  const focusRootId = branchFocus?.mapId === mapId && branchFocus.resetRevision === resetRevision
    && collapseIndex?.nodesById.has(branchFocus.id) ? branchFocus.id : null;
  if (branchFocus !== null && focusRootId === null) setBranchFocus(null);

  const setFocusRootId = useCallback((id: number | null) => {
    if (id === null) {
      setBranchFocus(null);
      return;
    }
    const ancestors = collapseIndex && collectAncestorIds(collapseIndex, id);
    if (!ancestors) return;
    expandNodes(ancestors);
    setBranchFocus({ id, mapId, resetRevision });
  }, [collapseIndex, expandNodes, mapId, resetRevision]);
  const focusVisibleNodeIds = useMemo(() => (
    collapseIndex && focusRootId !== null ? collectSubtreeIds(collapseIndex, focusRootId) : null
  ), [collapseIndex, focusRootId]);
  const clearFocusOutsideBranch = useCallback((id: number) => {
    if (focusVisibleNodeIds && !focusVisibleNodeIds.has(id)) setFocusRootId(null);
  }, [focusVisibleNodeIds, setFocusRootId]);

  return { focusRootId, setFocusRootId, focusVisibleNodeIds, clearFocusOutsideBranch };
}
