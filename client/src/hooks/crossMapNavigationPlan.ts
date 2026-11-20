import { RESOLUTION_LEVEL_LABELS } from "@/config/resolutionLevelLabels";
import type { NodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { resolveResolutionLevel } from "@/domain/nodes/nodeResolutionLevel";
import { collectVisibleNodeIds } from "@/domain/nodes/nodeVisibility";
import { resolveNodeSearchReveal } from "@/domain/search/nodeSearchReveal";
import type { Node } from "@/types/node";
import type { ResolutionFilterMode, ResolutionLevel } from "@/types/nodeResolution";
import type { OperationNotice } from "@/types/operationNotice";

// useCrossMapNavigation が使う純粋な計算。React に依存しない

type OutlineNodeJumpInput = {
  nodes: readonly Node[];
  nodeId: number;
  resolutionMode: ResolutionFilterMode;
  // アウトラインからキャンバスへ戻るときはズームを初期値へ戻すので、解像度はこの値を基準に判定する
  initialViewportScale: number;
  // 親子関係が壊れたマップでは createNodeCollapseIndex が null を返す（useNodeSearchNavigation と同じ契約）
  collapseIndex: NodeCollapseIndex | null;
  collapsedNodeIds: ReadonlySet<number>;
  focusRootId?: number | null;
};

export type OutlineNodeJumpPlan = {
  ancestorIdsToExpand: readonly number[];
  resolutionLevel: ResolutionLevel | null;
  notice: OperationNotice | null;
};

// アウトライン表示中から別マップ由来のノードへジャンプするとき、状態を変える前に
// 展開する祖先・切り替える解像度・利用者への通知を決める。表示できないときは null（L-453）
export function planOutlineNodeJump({
  nodes,
  nodeId,
  resolutionMode,
  initialViewportScale,
  collapseIndex,
  collapsedNodeIds,
  focusRootId,
}: OutlineNodeJumpInput): OutlineNodeJumpPlan | null {
  const level = resolveResolutionLevel(resolutionMode, initialViewportScale, null);
  const reveal = resolveNodeSearchReveal({
    index: collapseIndex,
    collapsedNodeIds,
    resolutionVisibleNodeIds: collectVisibleNodeIds(nodes, level),
    nodeId,
  });
  if (reveal === null) return null;

  const messages: string[] = [];
  if (reveal.ancestorIdsToExpand.length > 0) {
    messages.push("検索結果を表示するため、祖先の枝を展開しました。");
  }
  const resolutionLevel = nodeId === focusRootId ? null : reveal.resolutionLevel;
  if (resolutionLevel !== null) {
    messages.push(
      `表示を『${RESOLUTION_LEVEL_LABELS[resolutionLevel]}』に切り替えました。ズームに連動させるには『自動』を選んでください。`,
    );
  }
  return {
    ancestorIdsToExpand: reveal.ancestorIdsToExpand,
    resolutionLevel,
    notice: messages.length > 0 ? { kind: "status", message: messages.join(" ") } : null,
  };
}
