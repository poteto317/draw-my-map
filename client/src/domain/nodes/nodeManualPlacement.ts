import { CHILD_HORIZONTAL_GAP, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import { hasSufficientGap } from "@/domain/nodes/nodeLayoutArithmetic";
import type { Node } from "@/types/node";

// 手動配置では、マップ全体の下端からSIBLING_VERTICAL_GAPだけ空けた位置へ、sourcesを真下へ平行移動する。
// 空のマップでは基準となる下端が無いため移動しない。
// 非有限値になる場合や、丸めで間隔を確保できない場合はnullを返す。
export function calculateManualOffsetY(
  current: readonly Node[],
  sources: readonly Node[],
): number | null {
  if (current.length === 0) return 0;

  let bottom = -Infinity;
  for (const node of current) {
    const nodeBottom = node.y + node.height;
    if (nodeBottom > bottom) bottom = nodeBottom;
  }

  let top = Infinity;
  for (const node of sources) {
    if (node.y < top) top = node.y;
  }

  const offsetY = bottom + SIBLING_VERTICAL_GAP - top;
  if (!Number.isFinite(bottom) || !Number.isFinite(offsetY)) return null;
  if (!hasSufficientGap(bottom, top + offsetY, SIBLING_VERTICAL_GAP)) return null;
  return offsetY;
}

// 子を追加するときの左上の位置。既存の子が無ければ親と同じ高さ、あれば既存の子の下端の最大値からSIBLING_VERTICAL_GAPだけ空ける。
// 位置が有限かどうかは検査しない（森の挿入は移動量の計算で検査する）。親が無ければnullを返す。
export function calculateChildPlacement(
  nodes: readonly Node[],
  parentId: number,
): { x: number; y: number } | null {
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent) return null;

  // 子が多くても引数の上限を超えないよう、スプレッドではなくループで最大値を求める。
  // 子の下端にNaNがあれば、Math.maxの規則で結果もNaNになる
  let hasChild = false;
  let bottom = -Infinity;
  for (const node of nodes) {
    if (node.parentId !== parentId) continue;
    hasChild = true;
    bottom = Math.max(bottom, node.y + node.height);
  }

  return {
    x: parent.x + parent.width + CHILD_HORIZONTAL_GAP,
    y: hasChild ? bottom + SIBLING_VERTICAL_GAP : parent.y,
  };
}
