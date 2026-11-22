import type { LayoutNodeForestOptions } from "@/domain/nodes/nodeAutoLayout";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { NodeMapState } from "@/types/nodeMapState";
import type { TreeDirection } from "@/types/treeDirection";

export type NodeMapLayoutContext = Pick<NodeMapState, "treeDirection" | "layoutSpacing">;

export function resolveLayoutSpacing(
  state: Pick<NodeMapState, "layoutSpacing">,
): LayoutSpacing {
  return state.layoutSpacing ?? DEFAULT_LAYOUT_SPACING;
}

export function resolveTreeDirection(
  state: Pick<NodeMapState, "treeDirection">,
): TreeDirection {
  return state.treeDirection ?? "lr";
}

export function resolveLayoutNodeForestOptions(
  state: NodeMapLayoutContext,
): LayoutNodeForestOptions {
  return {
    direction: resolveTreeDirection(state),
    spacing: resolveLayoutSpacing(state),
  };
}