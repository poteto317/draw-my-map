import { useCallback } from "react";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { RESOLUTION_LEVEL_LABELS } from "@/config/resolutionLevelLabels";
import type { NodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { resolveResolutionLevel } from "@/domain/nodes/nodeResolutionLevel";
import { collectVisibleNodeIds } from "@/domain/nodes/nodeVisibility";
import { resolveNodeSearchReveal } from "@/domain/search/nodeSearchReveal";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";
import type { ResolutionFilterMode } from "@/types/nodeResolution";

type Options = {
  nodes: readonly Node[];
  selectedNodeId: number | null;
  documentRevision: number;
  collapseIndex: NodeCollapseIndex | null;
  collapsedNodeIds: ReadonlySet<number>;
  resolutionMode: ResolutionFilterMode;
  expandNodes: (ids: readonly number[]) => void;
  setResolutionMode: (mode: ResolutionFilterMode) => void;
  publishNotice: (notice: OperationNotice) => void;
  issueFocusRequest: (nodeId: number) => void;
};

export function useOutlineCanvasReturn({
  nodes,
  selectedNodeId,
  collapseIndex,
  collapsedNodeIds,
  resolutionMode,
  expandNodes,
  setResolutionMode,
  publishNotice,
  issueFocusRequest,
}: Options) {
  const returnToCanvas = useCallback(() => {
    if (selectedNodeId === null || !nodes.some(node => node.id === selectedNodeId)) return;
    // 再mountするcanvasは初期viewportから始まるため、旧ズームとauto履歴を使わない。
    const level = resolveResolutionLevel(resolutionMode, INITIAL_VIEWPORT.scale, null);
    const reveal = resolveNodeSearchReveal({
      index: collapseIndex,
      collapsedNodeIds,
      resolutionVisibleNodeIds: collectVisibleNodeIds(nodes, level),
      nodeId: selectedNodeId,
    });
    if (reveal === null) return;
    const messages: string[] = [];
    if (reveal.ancestorIdsToExpand.length > 0) {
      expandNodes(reveal.ancestorIdsToExpand);
      messages.push("選択したノードを表示するため、祖先の枝を展開しました。");
    }
    if (reveal.resolutionLevel !== null) {
      setResolutionMode(reveal.resolutionLevel);
      messages.push(`表示を『${RESOLUTION_LEVEL_LABELS[reveal.resolutionLevel]}』に切り替えました。ズームに連動させるには『自動』を選んでください。`);
    }
    if (messages.length > 0) publishNotice({ kind: "status", message: messages.join(" ") });
    issueFocusRequest(selectedNodeId);
  }, [
    nodes, selectedNodeId, collapseIndex, collapsedNodeIds, resolutionMode,
    expandNodes, setResolutionMode, publishNotice, issueFocusRequest,
  ]);
  return { returnToCanvas };
}
