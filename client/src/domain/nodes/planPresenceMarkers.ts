import {
  arePresenceInputsComplete,
  collectPresenceEdgeChildIds,
  collectPresenceNodeIds,
  collectStructuralVisibleNodeIds,
} from "@/domain/nodes/mapPresenceVisibility";
import type { Node } from "@/types/node";
import type { ResolutionFilterMode } from "@/types/nodeResolution";

export type PresencePlan = {
  presenceNodeIds: ReadonlySet<number>;
  presenceEdgeChildIds: readonly number[];
};

export type PlanPresenceMarkersInput = {
  nodes: readonly Node[];
  resolutionMode?: ResolutionFilterMode | null;
  collapseVisibleNodeIds?: ReadonlySet<number> | null;
  focusVisibleNodeIds?: ReadonlySet<number> | null;
  depthVisibleNodeIds?: ReadonlySet<number> | null;
  displayVisibleNodeIds?: ReadonlySet<number> | null;
};

/**
 * presence 候補の純算出。入力非完備なら null（空 Set の「成功ゼロ」に倒さない）。
 * pixi / React に依存しない（domain 純関数のオーケストレーションのみ）。
 */
export function planPresenceMarkers({
  nodes,
  resolutionMode,
  collapseVisibleNodeIds,
  focusVisibleNodeIds,
  depthVisibleNodeIds,
  displayVisibleNodeIds,
}: PlanPresenceMarkersInput): PresencePlan | null {
  if (!arePresenceInputsComplete({
    mode: resolutionMode,
    collapseVisibleNodeIds,
    focusVisibleNodeIds,
    depthVisibleNodeIds,
    displayVisibleNodeIds,
  })) {
    // L-002: 欠落≠候補ゼロ。黙殺せず開発時に分かるようにする（設計 §4.1）
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[presence] inputs incomplete; skipping presence markers (L-002)",
      );
    }
    return null;
  }

  const structuralVisibleNodeIds = collectStructuralVisibleNodeIds(
    nodes.map((node) => node.id),
    {
      collapseVisibleNodeIds,
      focusVisibleNodeIds,
      depthVisibleNodeIds: depthVisibleNodeIds!,
    },
  );
  const presenceNodeIds = collectPresenceNodeIds(
    structuralVisibleNodeIds,
    displayVisibleNodeIds!,
    resolutionMode!,
  );
  const presenceEdgeChildIds = collectPresenceEdgeChildIds(
    nodes,
    presenceNodeIds,
    structuralVisibleNodeIds,
    displayVisibleNodeIds!,
  );
  return { presenceNodeIds, presenceEdgeChildIds };
}
