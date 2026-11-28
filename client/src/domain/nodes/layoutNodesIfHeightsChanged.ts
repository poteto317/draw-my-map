import {
  layoutNodeForest,
  type LayoutNodeForestOptions,
} from "@/domain/nodes/nodeAutoLayout";
import { anyNodeHeightsChanged } from "@/domain/nodes/nodeLabelLayout";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { Node } from "@/types/node";

/** auto かつ高さ変化があるときだけ layout が必要（編集系の経路切替用） */
export function shouldLayoutAfterHeightFit(
  previous: readonly Node[],
  fitted: readonly Node[],
  layoutMode: NodeLayoutMode,
): boolean {
  return layoutMode === "auto" && anyNodeHeightsChanged(previous, fitted);
}

/**
 * fit 後のノードについて、auto かつ高さ変化があれば layout する。
 * layout 不要なら fitted を返す。layout 失敗時は null
 *（呼び出し側が増高破棄 or placement-failed を決める）。
 */
export function layoutNodesIfHeightsChanged(
  previous: readonly Node[],
  fitted: readonly Node[],
  layoutMode: NodeLayoutMode,
  options?: LayoutNodeForestOptions,
): Node[] | null {
  if (!shouldLayoutAfterHeightFit(previous, fitted, layoutMode)) {
    return fitted as Node[];
  }
  return layoutNodeForest(fitted, options);
}
