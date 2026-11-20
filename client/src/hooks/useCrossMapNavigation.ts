"use client";

import { useCallback, useEffect, useRef } from "react";
import type { NodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { planOutlineNodeJump } from "@/hooks/crossMapNavigationPlan";
import { isPendingNavigationReadyToConsume } from "@/hooks/pendingMapNavigationState";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { Node } from "@/types/node";
import type { ResolutionFilterMode } from "@/types/nodeResolution";
import type { OperationNotice } from "@/types/operationNotice";
import type { PendingMapNodeNavigation } from "@/types/pendingMapNavigation";

const TARGET_NODE_MISSING_NOTICE: OperationNotice = {
  kind: "error",
  message: "移動先のノードが見つかりませんでした",
};

type UseCrossMapNavigationParams = {
  mapId: string;
  sessionNumber: number;
  hydrated: boolean;
  nodes: readonly Node[];
  documentRevision: number;
  viewMode: "map" | "outline";
  initialViewportScale: number;
  resolutionMode: ResolutionFilterMode;
  // 親子関係が壊れたマップでは createNodeCollapseIndex が null を返す（useNodeSearchNavigation と同じ契約）
  collapseIndex: NodeCollapseIndex | null;
  collapsedNodeIds: ReadonlySet<number>;
  expandNodes: (nodeIds: readonly number[]) => void;
  setResolutionMode: (mode: ResolutionFilterMode) => void;
  resetViewportScale: (scale: number) => void;
  setViewportScale: (scale: number) => void;
  setViewMode: (mode: "map" | "outline") => void;
  selectNode: (nodeId: number) => void;
  issueCanvasFocusRequest: (nodeId: number) => void;
  clearCanvasFocusRequest: () => void;
  navigateToNodeInMapView: (nodeId: number) => void;
  pendingNavigation: PendingMapNodeNavigation | null;
  onConsumePendingNavigation: (token: number) => void;
  onSwitchToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
};

export type UseCrossMapNavigationResult = {
  navigationNotice: OperationNotice | null;
  navigateToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
};

// 全マップ横断検索・マップ間リンク・被リンク・リンク切れ一覧からのジャンプと、
// 別マップ切替後の保留ナビゲーション 1 回消費を調停するフック
export function useCrossMapNavigation({
  mapId,
  sessionNumber,
  hydrated,
  nodes,
  documentRevision,
  viewMode,
  initialViewportScale,
  resolutionMode,
  collapseIndex,
  collapsedNodeIds,
  expandNodes,
  setResolutionMode,
  resetViewportScale,
  setViewportScale,
  setViewMode,
  selectNode,
  issueCanvasFocusRequest,
  clearCanvasFocusRequest,
  navigateToNodeInMapView,
  pendingNavigation,
  onConsumePendingNavigation,
  onSwitchToMapTarget,
}: UseCrossMapNavigationParams): UseCrossMapNavigationResult {
  const {
    notice: navigationNotice,
    publishNotice: publishNavigationNotice,
  } = useRevisionScopedNotice(documentRevision);

  const navigateToLocalNode = useCallback(
    (nodeId: number) => {
      if (!nodes.some((candidate) => candidate.id === nodeId)) {
        publishNavigationNotice(TARGET_NODE_MISSING_NOTICE);
        return;
      }
      if (viewMode === "outline") {
        // アウトライン表示中から直接ノードへジャンプするときは returnToCanvas() を通さず、
        // 初期ズーム基準で解像度判定を先に検証してから状態更新・展開・切替・選択・フォーカスを実行する（L-453）
        const plan = planOutlineNodeJump({
          nodes,
          nodeId,
          resolutionMode,
          initialViewportScale,
          collapseIndex,
          collapsedNodeIds,
        });
        if (plan === null) {
          publishNavigationNotice(TARGET_NODE_MISSING_NOTICE);
          return;
        }
        clearCanvasFocusRequest();
        setViewportScale(initialViewportScale);
        resetViewportScale(initialViewportScale);
        if (plan.ancestorIdsToExpand.length > 0) {
          expandNodes(plan.ancestorIdsToExpand);
        }
        if (plan.resolutionLevel !== null) {
          setResolutionMode(plan.resolutionLevel);
        }
        if (plan.notice !== null) {
          publishNavigationNotice(plan.notice);
        }
        selectNode(nodeId);
        issueCanvasFocusRequest(nodeId);
        setViewMode("map");
        return;
      }
      navigateToNodeInMapView(nodeId);
    },
    [
      clearCanvasFocusRequest,
      collapseIndex,
      collapsedNodeIds,
      expandNodes,
      initialViewportScale,
      issueCanvasFocusRequest,
      navigateToNodeInMapView,
      nodes,
      publishNavigationNotice,
      resetViewportScale,
      resolutionMode,
      selectNode,
      setResolutionMode,
      setViewMode,
      setViewportScale,
      viewMode,
    ],
  );

  const navigateToMapTarget = useCallback(
    (targetMapId: string, targetNodeId?: number) => {
      if (targetMapId === mapId) {
        if (targetNodeId !== undefined) {
          navigateToLocalNode(targetNodeId);
        }
        return;
      }
      onSwitchToMapTarget(targetMapId, targetNodeId);
    },
    [mapId, navigateToLocalNode, onSwitchToMapTarget],
  );

  // 別マップ切替後のノードジャンプ要求を、対象マップ・セッション・復元完了の一致時に 1 回限り消費する（L-037）
  const consumedNavigationTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPendingNavigationReadyToConsume(pendingNavigation, { mapId, sessionNumber, hydrated })) {
      return;
    }
    if (consumedNavigationTokenRef.current === pendingNavigation.token) return;
    consumedNavigationTokenRef.current = pendingNavigation.token;
    navigateToLocalNode(pendingNavigation.nodeId);
    onConsumePendingNavigation(pendingNavigation.token);
  }, [
    pendingNavigation,
    mapId,
    sessionNumber,
    hydrated,
    navigateToLocalNode,
    onConsumePendingNavigation,
  ]);

  return {
    navigationNotice,
    navigateToMapTarget,
  };
}
