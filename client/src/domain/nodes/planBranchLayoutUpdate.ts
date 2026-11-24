import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  applySetBranchLayout,
  type SetBranchLayoutResult,
} from "@/domain/nodes/nodeBranchLayout";
import {
  layoutContextFromState,
  resolveLayoutNodeForestOptions,
} from "@/domain/nodes/nodeMapLayoutContext";
import type { BranchLayoutDirection } from "@/types/branchLayout";
import type { NodeMapState } from "@/types/nodeMapState";

export type PlanBranchLayoutUpdateResult =
  | { ok: true; state: NodeMapState }
  | { ok: false; reason: Exclude<SetBranchLayoutResult, { ok: true }>["reason"] | "placement-failed" };

/**
 * branchLayouts 更新＋（auto+orthogonal 時のみ）再配置の次状態を純計算する。
 * commit / preview は呼び出し側の副作用。
 */
export function planBranchLayoutUpdate(
  current: NodeMapState,
  nodeId: number,
  direction: BranchLayoutDirection | null,
): PlanBranchLayoutUpdateResult {
  const planned = applySetBranchLayout(
    current.nodes,
    current.branchLayouts,
    nodeId,
    direction,
  );
  if (!planned.ok) {
    return { ok: false, reason: planned.reason };
  }

  const nextState: NodeMapState = {
    ...current,
    branchLayouts: planned.branchLayouts,
  };
  const shouldRelayout = current.layoutMode === "auto"
    && (current.layoutStyle ?? "orthogonal") === "orthogonal";

  if (!shouldRelayout) {
    return { ok: true, state: nextState };
  }

  const layoutOptions = resolveLayoutNodeForestOptions(layoutContextFromState(nextState));
  const nextNodes = layoutNodeForest(current.nodes, layoutOptions);
  if (!nextNodes) return { ok: false, reason: "placement-failed" };

  return { ok: true, state: { ...nextState, nodes: nextNodes } };
}
