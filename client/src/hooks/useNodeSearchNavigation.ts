import { useCallback, useState } from "react";
import { RESOLUTION_LEVEL_LABELS } from "@/config/resolutionLevelLabels";
import type { NodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { resolveNodeSearchReveal } from "@/domain/search/nodeSearchReveal";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { Node } from "@/types/node";
import type { NodeFocusRequest } from "@/types/nodeFocusRequest";
import type { OperationNotice } from "@/types/operationNotice";
import type { ResolutionFilterMode } from "@/types/nodeResolution";

export type NodeSearchNavigationResult = "navigated" | "revealed" | "missing";

type UseNodeSearchNavigationOptions = {
  nodes: readonly Node[];
  resolutionVisibleNodeIds: ReadonlySet<number>;
  collapseIndex: NodeCollapseIndex | null;
  collapsedNodeIds: ReadonlySet<number>;
  expandNodes: (nodeIds: readonly number[]) => void;
  documentRevision: number;
  setResolutionMode: (mode: ResolutionFilterMode) => void;
  selectNode: (id: number | null) => void;
};

const MISSING_NODE_NOTICE: OperationNotice = {
  kind: "error",
  message: "ノードが見つかりませんでした。",
};

export function useNodeSearchNavigation({
  nodes,
  resolutionVisibleNodeIds,
  collapseIndex,
  collapsedNodeIds,
  expandNodes,
  documentRevision,
  setResolutionMode,
  selectNode,
}: UseNodeSearchNavigationOptions) {
  const [storedFocusRequest, setStoredFocusRequest] = useState<NodeFocusRequest | null>(null);
  const { notice, publishNotice } = useRevisionScopedNotice(documentRevision);

  const navigateToNode = useCallback((nodeId: number): NodeSearchNavigationResult => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) {
      publishNotice(MISSING_NODE_NOTICE);
      return "missing";
    }

    const reveal = resolveNodeSearchReveal({
      index: collapseIndex, collapsedNodeIds, resolutionVisibleNodeIds, nodeId,
    });
    if (reveal === null) {
      publishNotice(MISSING_NODE_NOTICE);
      return "missing";
    }

    const messages: string[] = [];
    if (reveal.ancestorIdsToExpand.length > 0) {
      expandNodes(reveal.ancestorIdsToExpand);
      messages.push("検索結果を表示するため、祖先の枝を展開しました。");
    }
    if (reveal.resolutionLevel !== null) {
      const level = reveal.resolutionLevel;
      setResolutionMode(level);
      messages.push(`表示を『${RESOLUTION_LEVEL_LABELS[level]}』に切り替えました。ズームに連動させるには『自動』を選んでください。`);
    }
    if (messages.length > 0) {
      publishNotice({ kind: "status", message: messages.join(" ") });
    }

    selectNode(nodeId);
    setStoredFocusRequest((current) => ({
      nodeId,
      sequence: (current?.sequence ?? 0) + 1,
      documentRevision,
    }));
    return messages.length > 0 ? "revealed" : "navigated";
  }, [
    collapseIndex,
    collapsedNodeIds,
    expandNodes,
    documentRevision,
    nodes,
    publishNotice,
    selectNode,
    setResolutionMode,
    resolutionVisibleNodeIds,
  ]);

  const focusRequest = storedFocusRequest?.documentRevision === documentRevision
    ? storedFocusRequest
    : null;

  return { navigateToNode, focusRequest, notice };
}
