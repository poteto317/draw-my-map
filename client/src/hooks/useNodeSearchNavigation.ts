import { useCallback, useState } from "react";
import { RESOLUTION_LEVEL_LABELS } from "@/config/resolutionLevelLabels";
import { resolveMinimumVisibleLevel } from "@/domain/nodes/nodeResolution";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { Node } from "@/types/node";
import type { NodeFocusRequest } from "@/types/nodeFocusRequest";
import type { OperationNotice } from "@/types/operationNotice";
import type { ResolutionFilterMode } from "@/types/nodeResolution";

export type NodeSearchNavigationResult = "navigated" | "revealed" | "missing";

type UseNodeSearchNavigationOptions = {
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
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
  visibleNodeIds,
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

    const hidden = !visibleNodeIds.has(nodeId);
    if (hidden) {
      const level = resolveMinimumVisibleLevel(node.importance);
      setResolutionMode(level);
      publishNotice({
        kind: "status",
        message: `表示を『${RESOLUTION_LEVEL_LABELS[level]}』に切り替えました。ズームに連動させるには『自動』を選んでください。`,
      });
    }

    selectNode(nodeId);
    setStoredFocusRequest((current) => ({
      nodeId,
      sequence: (current?.sequence ?? 0) + 1,
      documentRevision,
    }));
    return hidden ? "revealed" : "navigated";
  }, [
    documentRevision,
    nodes,
    publishNotice,
    selectNode,
    setResolutionMode,
    visibleNodeIds,
  ]);

  const focusRequest = storedFocusRequest?.documentRevision === documentRevision
    ? storedFocusRequest
    : null;

  return { navigateToNode, focusRequest, notice };
}
