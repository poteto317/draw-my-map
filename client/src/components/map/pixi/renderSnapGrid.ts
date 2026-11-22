import type { WorldRect } from "@/domain/nodes/cullNodesInViewport";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { Graphics } from "pixi.js";

const GRID_COLOR = 0x94a3b8;
const GRID_ALPHA = 0.25;

export type SnapGridLineRange = {
  readonly startX: number;
  readonly endX: number;
  readonly startY: number;
  readonly endY: number;
};

export function computeSnapGridLineRange(
  worldRect: WorldRect,
  gridStep: number,
): SnapGridLineRange | null {
  if (
    !Number.isFinite(worldRect.x)
    || !Number.isFinite(worldRect.y)
    || !Number.isFinite(worldRect.width)
    || !Number.isFinite(worldRect.height)
    || gridStep <= 0
  ) {
    return null;
  }

  const minX = worldRect.x;
  const maxX = worldRect.x + worldRect.width;
  const minY = worldRect.y;
  const maxY = worldRect.y + worldRect.height;

  const startX = Math.floor(minX / gridStep) * gridStep;
  const endX = Math.ceil(maxX / gridStep) * gridStep;
  const startY = Math.floor(minY / gridStep) * gridStep;
  const endY = Math.ceil(maxY / gridStep) * gridStep;

  return { startX, endX, startY, endY };
}

export function drawSnapGrid(
  graphics: Graphics,
  range: SnapGridLineRange,
  gridStep: number,
): void {
  graphics.clear();
  for (let x = range.startX; x <= range.endX; x += gridStep) {
    graphics
      .moveTo(x, range.startY)
      .lineTo(x, range.endY)
      .stroke({ width: 1, color: GRID_COLOR, alpha: GRID_ALPHA });
  }
  for (let y = range.startY; y <= range.endY; y += gridStep) {
    graphics
      .moveTo(range.startX, y)
      .lineTo(range.endX, y)
      .stroke({ width: 1, color: GRID_COLOR, alpha: GRID_ALPHA });
  }
}

export function createSnapGridGraphics(constructors: PixiConstructors): Graphics {
  const graphics = new constructors.Graphics();
  graphics.eventMode = "none";
  graphics.label = "snap-grid";
  return graphics;
}