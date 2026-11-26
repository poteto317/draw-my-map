import { ILLUSTRATION_AREA_HEIGHT } from "@/config/shapes";
import type { TaskProgress } from "@/domain/nodes/nodeTaskProgress";
import type { Node } from "@/types/node";

const NODE_INNER_PADDING = 16;
const PROGRESS_BAND_MAX_HEIGHT = 16;
const PROGRESS_MIN_BAND_HEIGHT = 10;
const PROGRESS_MIN_INNER_WIDTH = 40;
const PROGRESS_BAND_GAP = 4;
const PROGRESS_BADGE_Y_OFFSET = 2;
const LABEL_UNDERLINE_EXTRA_HEIGHT = 4;

export type NodeLabelRenderMetrics = {
  textWidth: number;
  textHeight: number;
  textY: number;
  iconWidth?: number;
  iconX?: number;
  iconHeight?: number;
  hasUnderline: boolean;
};

export type TaskProgressMapBodyMetrics = {
  bodyTop: number;
  bodyHeight: number;
  innerWidth: number;
  bandHeight: number;
};

export type TaskProgressMapLabelLayout = {
  upper: { scale: number; x: number; y: number };
  badge: { x: number; y: number };
};

export function formatTaskProgressMapBadgeText(progress: TaskProgress): string {
  return `${progress.percent}% 残${progress.remaining}`;
}

export function resolveTaskProgressMapBody(node: Node): TaskProgressMapBodyMetrics {
  const bodyTop = node.y + (node.illustration === undefined ? 0 : ILLUSTRATION_AREA_HEIGHT);
  const bodyHeight = node.y + node.height - bodyTop;
  const innerWidth = node.width - NODE_INNER_PADDING;
  const bandHeight = Math.min(PROGRESS_BAND_MAX_HEIGHT, bodyHeight / 3);
  return { bodyTop, bodyHeight, innerWidth, bandHeight };
}

export function shouldShowTaskProgressMapBadge(
  progress: TaskProgress | undefined,
  body: Pick<TaskProgressMapBodyMetrics, "bandHeight" | "innerWidth">,
): boolean {
  if (!progress) return false;
  return body.bandHeight >= PROGRESS_MIN_BAND_HEIGHT && body.innerWidth >= PROGRESS_MIN_INNER_WIDTH;
}

export function computeTaskProgressMapLabelLayout(
  node: Node,
  metrics: NodeLabelRenderMetrics,
  body: TaskProgressMapBodyMetrics,
): TaskProgressMapLabelLayout {
  const cx = node.x + node.width / 2;
  const width = Math.max(
    metrics.textWidth,
    metrics.iconWidth !== undefined && metrics.iconX !== undefined
      ? 2 * (cx - metrics.iconX) + metrics.iconWidth
      : 0,
  );
  const height = Math.max(
    metrics.textHeight + (metrics.hasUnderline ? LABEL_UNDERLINE_EXTRA_HEIGHT : 0),
    metrics.iconHeight ?? 0,
  );
  const upperHeight = body.bodyHeight - body.bandHeight - PROGRESS_BAND_GAP;
  const ratio = Math.min(
    1,
    body.innerWidth / Math.max(1, width),
    upperHeight / Math.max(1, height),
  );
  return {
    upper: {
      scale: ratio,
      x: cx * (1 - ratio),
      y: body.bodyTop + upperHeight / 2 - ratio * metrics.textY,
    },
    badge: {
      x: cx,
      y: node.y + node.height - body.bandHeight / 2 - PROGRESS_BADGE_Y_OFFSET,
    },
  };
}