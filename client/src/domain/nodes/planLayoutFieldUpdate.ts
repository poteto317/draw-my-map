import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  layoutContextFromState,
  resolveLayoutNodeForestOptions,
} from "@/domain/nodes/nodeMapLayoutContext";
import type { NodeMapState } from "@/types/nodeMapState";

/**
 * layout 設定フィールド更新の次状態を純計算する。
 * 配置入力は `{ ...current, ...patch }` から layoutContextFromState（単一ソース）。
 * auto で配置失敗時は null。manual は常に成功。
 */
export function planLayoutFieldUpdate(
  current: NodeMapState,
  patch: Partial<NodeMapState>,
): NodeMapState | null {
  const nextState = { ...current, ...patch };
  const layoutOptions = resolveLayoutNodeForestOptions(layoutContextFromState(nextState));
  const nextNodes = current.layoutMode === "auto"
    ? layoutNodeForest(current.nodes, layoutOptions)
    : current.nodes;
  if (current.layoutMode === "auto" && !nextNodes) return null;

  return {
    ...nextState,
    nodes: nextNodes ?? current.nodes,
  };
}
