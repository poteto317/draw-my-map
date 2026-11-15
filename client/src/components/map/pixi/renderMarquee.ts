import type { MarqueeRect } from "@/components/map/pixi/marqueeSelectGesture";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { Container } from "pixi.js";

const MARQUEE_COLOR = 0x2563eb;
const MARQUEE_FILL_ALPHA = 0.15;
const MARQUEE_STROKE_ALPHA = 0.9;

export function renderMarquee(
  worldContainer: Container,
  constructors: PixiConstructors,
  marqueeRect: MarqueeRect | null,
): void {
  if (marqueeRect === null) return;
  const { x, y, width, height } = marqueeRect;
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
  ) {
    return;
  }

  const graphics = new constructors.Graphics();
  graphics.rect(x, y, width, height)
    .fill({ color: MARQUEE_COLOR, alpha: MARQUEE_FILL_ALPHA })
    .stroke({ width: 1, color: MARQUEE_COLOR, alpha: MARQUEE_STROKE_ALPHA });
  graphics.eventMode = "none";
  worldContainer.addChild(graphics);
}
