import type { WorldRect } from "@/domain/nodes/cullNodesInViewport";
import type { Node } from "@/types/node";

export const MINIMAP_DEFAULT_WIDTH = 160;
export const MINIMAP_DEFAULT_HEIGHT = 120;
export const MINIMAP_PADDING = 8;
/** ミニマップに描くノード数の上限。超過時は間引く。 */
export const MINIMAP_MAX_DRAW_NODES = 500;

export type MinimapSize = {
  readonly width: number;
  readonly height: number;
};

export type MinimapPoint = {
  readonly x: number;
  readonly y: number;
};

export type MinimapTransform = {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
};

type LayoutBox = Pick<Node, "x" | "y" | "width" | "height">;

/** ノード layout AABB。空なら null。退化矩形は最小 1×1 に広げる。 */
export function computeNodesWorldBounds(nodes: readonly LayoutBox[]): WorldRect | null {
  if (nodes.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)
      || !Number.isFinite(node.width) || !Number.isFinite(node.height)) {
      return null;
    }
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** ワールド AABB をミニマップサイズへアスペクト比維持で収める変換。 */
export function createMinimapTransform(
  worldBounds: WorldRect,
  size: MinimapSize,
  padding: number,
): MinimapTransform {
  const pad = Number.isFinite(padding) && padding > 0 ? padding : 0;
  const availW = Math.max(1, size.width - 2 * pad);
  const availH = Math.max(1, size.height - 2 * pad);
  const scale = Math.min(availW / worldBounds.width, availH / worldBounds.height);
  const contentW = worldBounds.width * scale;
  const contentH = worldBounds.height * scale;
  return {
    scale,
    offsetX: pad + (availW - contentW) / 2 - worldBounds.x * scale,
    offsetY: pad + (availH - contentH) / 2 - worldBounds.y * scale,
    width: size.width,
    height: size.height,
  };
}

export function worldToMinimap(point: MinimapPoint, transform: MinimapTransform): MinimapPoint {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
}

export function minimapToWorld(point: MinimapPoint, transform: MinimapTransform): MinimapPoint {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  };
}

export function worldRectToMinimapRect(
  rect: WorldRect,
  transform: MinimapTransform,
): WorldRect {
  const topLeft = worldToMinimap({ x: rect.x, y: rect.y }, transform);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: rect.width * transform.scale,
    height: rect.height * transform.scale,
  };
}

/** 点数上限を超えるとき順序を保って等間隔に間引く。 */
export function thinMinimapNodes<T>(nodes: readonly T[], maxCount: number): readonly T[] {
  if (!Number.isFinite(maxCount) || maxCount < 1) return [];
  if (nodes.length <= maxCount) return nodes;
  const stride = Math.ceil(nodes.length / maxCount);
  const result: T[] = [];
  for (let i = 0; i < nodes.length && result.length < maxCount; i += stride) {
    result.push(nodes[i]!);
  }
  return result;
}
