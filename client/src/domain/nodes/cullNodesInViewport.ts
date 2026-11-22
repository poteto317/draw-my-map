import type { Node } from "@/types/node";

/** ワールド座標の軸平行矩形。 */
export type WorldRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** 画面ピクセルでのカリング余白。world へは `paddingPx / viewport.scale` で渡す。 */
export const VIEWPORT_CULL_PADDING_PX = 64;

/**
 * マージン付きビューポート矩形と layout AABB が交差するノードだけを返す（順序維持）。
 * 呼び出し側で ID 集合を作り visibleKeys／辺フィルタへ渡す。
 */
export function cullNodesInViewport(
  nodes: readonly Node[],
  worldRect: WorldRect,
  padding: number,
): ReadonlyArray<Node> {
  const pad = Number.isFinite(padding) && padding > 0 ? padding : 0;
  const left = worldRect.x - pad;
  const top = worldRect.y - pad;
  const right = worldRect.x + worldRect.width + pad;
  const bottom = worldRect.y + worldRect.height + pad;

  return nodes.filter((node) => {
    const nodeRight = node.x + node.width;
    const nodeBottom = node.y + node.height;
    return node.x < right && nodeRight > left && node.y < bottom && nodeBottom > top;
  });
}

/** 画面外でも選択中・編集中などのノードは描画集合へ戻す（正本 nodes の順序を保つ）。 */
export function mergeCulledNodesWithRequired(
  nodes: readonly Node[],
  culled: readonly Node[],
  requiredNodeIds: ReadonlySet<number>,
): ReadonlyArray<Node> {
  if (requiredNodeIds.size === 0) return culled;
  const culledIds = new Set(culled.map((node) => node.id));
  const needsMerge = [...requiredNodeIds].some((id) => !culledIds.has(id));
  if (!needsMerge) return culled;
  const mergedIds = new Set([...culledIds, ...requiredNodeIds]);
  return nodes.filter((node) => mergedIds.has(node.id));
}
