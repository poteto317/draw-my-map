import type { LayoutNodeForestOptions } from "@/domain/nodes/nodeAutoLayout";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { NodeMapState } from "@/types/nodeMapState";
import type { TreeDirection } from "@/types/treeDirection";

export type NodeMapLayoutContext = Pick<
  NodeMapState,
  "treeDirection" | "layoutSpacing" | "layoutStyle" | "branchLayouts"
>;

/** 文書 state から配置コンテキストだけを取り出す（純投影） */
export function layoutContextFromState(state: NodeMapState): NodeMapLayoutContext {
  return {
    treeDirection: state.treeDirection,
    layoutSpacing: state.layoutSpacing,
    layoutStyle: state.layoutStyle,
    branchLayouts: state.branchLayouts,
  };
}

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
    ...(state.layoutStyle !== undefined ? { layoutStyle: state.layoutStyle } : {}),
    ...(state.branchLayouts !== undefined ? { branchLayouts: state.branchLayouts } : {}),
  };
}
