import type { MapGroup } from "@/types/mapGroup";
import type { Node } from "@/types/node";

export const GROUP_FRAME_PADDING_PX = 12;
export const GROUP_FRAME_CORNER_RADIUS_PX = 8;
export const GROUP_DISPLAY_LABEL_FALLBACK = "グループ";

export type GroupAabb = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DrawableMapGroup = {
  group: MapGroup;
  aabb: GroupAabb;
};

/** メンバー矩形の AABB＋余白。可視が2未満なら null */
export function computeGroupAabb(
  nodes: readonly Node[],
  nodeIds: readonly number[],
  visibleNodeIds?: ReadonlySet<number>,
): GroupAabb | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const id of nodeIds) {
    if (visibleNodeIds !== undefined && !visibleNodeIds.has(id)) continue;
    const node = byId.get(id);
    if (node === undefined) continue;
    count += 1;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  if (count < 2) return null;
  return {
    x: minX - GROUP_FRAME_PADDING_PX,
    y: minY - GROUP_FRAME_PADDING_PX,
    width: (maxX - minX) + GROUP_FRAME_PADDING_PX * 2,
    height: (maxY - minY) + GROUP_FRAME_PADDING_PX * 2,
  };
}

/** 空ラベルの UI 表示フォールバック（永続データには書かない） */
export function groupDisplayLabel(label: string): string {
  return label === "" ? GROUP_DISPLAY_LABEL_FALLBACK : label;
}

/**
 * 描画可能なグループ枠を面積降順で返す（大きい枠を先＝背面）。
 * Pixi 組み立て前の純計算 — ヒット優先の並びをレンダ I/O なしで検証できる。
 */
export function listDrawableMapGroups(
  groups: readonly MapGroup[] | undefined,
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
): DrawableMapGroup[] {
  if (groups === undefined || groups.length === 0) return [];
  const drawable: DrawableMapGroup[] = [];
  for (const group of groups) {
    const aabb = computeGroupAabb(nodes, group.nodeIds, visibleNodeIds);
    if (aabb === null) continue;
    drawable.push({ group, aabb });
  }
  drawable.sort((a, b) => (b.aabb.width * b.aabb.height) - (a.aabb.width * a.aabb.height));
  return drawable;
}
