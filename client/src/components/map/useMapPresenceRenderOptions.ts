"use client";

import { useMemo } from "react";
import {
  getViewportWorldRect,
  isValidScreenSize,
  type ScreenSize,
  type Viewport,
} from "@/components/map/mapViewport";
import type { RenderMapSceneOptions } from "@/components/map/pixi/renderMapScene";
import { isViewportCullingEnabled } from "@/components/map/viewportCullingPolicy";
import {
  cullNodesInViewport,
  VIEWPORT_CULL_PADDING_PX,
} from "@/domain/nodes/cullNodesInViewport";
import { cullPresenceEdgeChildIds } from "@/domain/nodes/cullPresenceEdges";
import {
  planPresenceMarkers,
  type PresencePlan,
} from "@/domain/nodes/planPresenceMarkers";
import type { Node } from "@/types/node";
import type { ResolutionFilterMode } from "@/types/nodeResolution";

const EMPTY_NODES: readonly Node[] = [];
const EMPTY_PRESENCE_EDGE_CHILD_IDS: readonly number[] = [];

/** effect deps 用。内容が同じなら同じキー → useMemo が参照を維持 */
function numberSetStabilityKey(value: ReadonlySet<number> | null): string {
  if (value === null) return "\0null";
  return `\0set:${[...value].sort((a, b) => a - b).join(",")}`;
}

function numberListStabilityKey(value: readonly number[] | null): string {
  if (value === null) return "\0null";
  return `\0list:${value.join(",")}`;
}

export type UseMapPresenceRenderOptionsInput = {
  nodes: readonly Node[];
  resolutionMode?: ResolutionFilterMode | null;
  collapseVisibleNodeIds?: ReadonlySet<number> | null;
  focusVisibleNodeIds?: ReadonlySet<number> | null;
  depthVisibleNodeIds?: ReadonlySet<number> | null;
  displayVisibleNodeIds?: ReadonlySet<number> | null;
  viewport: Viewport;
  screenSize: ScreenSize | null;
};

export type MapPresenceRenderOptions = Pick<
  RenderMapSceneOptions,
  "presenceNodeIds" | "presenceEdgeChildIds" | "presenceNodes"
>;

/**
 * presence 算出 → cull → 参照安定化まで。非完備時は null（options に混ぜない）。
 * L-467: useMemo 純導出のみ。viewport cull hook（render 中 setState）は使わない。
 */
export function useMapPresenceRenderOptions({
  nodes,
  resolutionMode,
  collapseVisibleNodeIds,
  focusVisibleNodeIds,
  depthVisibleNodeIds,
  displayVisibleNodeIds,
  viewport,
  screenSize,
}: UseMapPresenceRenderOptionsInput): MapPresenceRenderOptions | null {
  const presencePlan: PresencePlan | null = useMemo(
    () => planPresenceMarkers({
      nodes,
      resolutionMode,
      collapseVisibleNodeIds,
      focusVisibleNodeIds,
      depthVisibleNodeIds,
      displayVisibleNodeIds,
    }),
    [
      nodes,
      resolutionMode,
      collapseVisibleNodeIds,
      focusVisibleNodeIds,
      depthVisibleNodeIds,
      displayVisibleNodeIds,
    ],
  );

  const presenceCandidateNodes = useMemo(() => {
    if (!presencePlan || presencePlan.presenceNodeIds.size === 0) return EMPTY_NODES;
    return nodes.filter((node) => presencePlan.presenceNodeIds.has(node.id));
  }, [nodes, presencePlan]);

  // presence ノード cull: フルと同じ layout AABB。required マージ無し（純 useMemo）
  const culledPresenceNodeIdsRaw = useMemo(() => {
    if (!presencePlan) return null;
    if (!isViewportCullingEnabled() || screenSize === null || !isValidScreenSize(screenSize)) {
      return presencePlan.presenceNodeIds;
    }
    const worldRect = getViewportWorldRect(viewport, screenSize);
    const padding = VIEWPORT_CULL_PADDING_PX / viewport.scale;
    const culled = cullNodesInViewport(presenceCandidateNodes, worldRect, padding);
    return new Set(culled.map((node) => node.id));
  }, [presencePlan, presenceCandidateNodes, viewport, screenSize]);

  const culledPresenceNodeIdsKey = numberSetStabilityKey(culledPresenceNodeIdsRaw);
  const culledPresenceNodeIds = useMemo(
    () => culledPresenceNodeIdsRaw,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stability key
    [culledPresenceNodeIdsKey],
  );

  const culledPresenceEdgeChildIdsRaw = useMemo(() => {
    if (!presencePlan) return null;
    if (!isViewportCullingEnabled() || screenSize === null || !isValidScreenSize(screenSize)) {
      return presencePlan.presenceEdgeChildIds.length === 0
        ? EMPTY_PRESENCE_EDGE_CHILD_IDS
        : presencePlan.presenceEdgeChildIds;
    }
    const worldRect = getViewportWorldRect(viewport, screenSize);
    const padding = VIEWPORT_CULL_PADDING_PX / viewport.scale;
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const culled = cullPresenceEdgeChildIds(
      presencePlan.presenceEdgeChildIds,
      nodesById,
      worldRect,
      padding,
    );
    return culled.length === 0 ? EMPTY_PRESENCE_EDGE_CHILD_IDS : culled;
  }, [presencePlan, nodes, viewport, screenSize]);

  const culledPresenceEdgeChildIdsKey = numberListStabilityKey(culledPresenceEdgeChildIdsRaw);
  const culledPresenceEdgeChildIds = useMemo(
    () => culledPresenceEdgeChildIdsRaw,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stability key
    [culledPresenceEdgeChildIdsKey],
  );

  // 空のときは scale を identity に載せない（ズーム毎の scene 全再生成を避ける）。
  // 非空のときだけ CONST/scale 半径更新のため scale 連動する。
  const hasPresenceContent = culledPresenceNodeIds !== null
    && culledPresenceEdgeChildIds !== null
    && (culledPresenceNodeIds.size > 0 || culledPresenceEdgeChildIds.length > 0);
  const presenceScaleDep = hasPresenceContent ? viewport.scale : null;

  return useMemo(() => {
    if (culledPresenceNodeIds === null || culledPresenceEdgeChildIds === null) {
      return null;
    }
    return {
      presenceNodeIds: culledPresenceNodeIds,
      presenceEdgeChildIds: culledPresenceEdgeChildIds,
      // 座標は表示座標全体。フル描画用 nodes には混ぜない
      presenceNodes: nodes,
    };
  }, [culledPresenceNodeIds, culledPresenceEdgeChildIds, nodes, presenceScaleDep]);
}
