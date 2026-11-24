import type { Point } from "@/components/map/mapGeometry";

export const NODE_CONTEXT_MENU_ITEM_HEIGHT = 36;
export const NODE_CONTEXT_MENU_WIDTH = 220;
const NODE_CONTEXT_MENU_VERTICAL_PADDING = 8;

export function measureNodeContextMenuHeight(visibleItemCount: number): number {
  return NODE_CONTEXT_MENU_VERTICAL_PADDING + visibleItemCount * NODE_CONTEXT_MENU_ITEM_HEIGHT;
}

/** クリップ用の最大高さ（イラスト＋切り出し＋関連線＋グループ＋ピン＋枝方向見出し/4方向/既定） */
export const NODE_CONTEXT_MENU_SIZE = {
  width: NODE_CONTEXT_MENU_WIDTH,
  height: measureNodeContextMenuHeight(13),
} as const;

export function clampNodeContextMenuPosition(
  anchor: Point,
  container: { width: number; height: number },
): Point {
  return {
    x: Math.max(0, Math.min(anchor.x, container.width - NODE_CONTEXT_MENU_SIZE.width)),
    y: Math.max(0, Math.min(anchor.y, container.height - NODE_CONTEXT_MENU_SIZE.height)),
  };
}
