import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { SiblingReorderIndicator } from "@/components/map/siblingReorderDropSlot";
import type { Container } from "pixi.js";

const INDICATOR_HEIGHT = 6;
const INDICATOR_COLOR = 0x2563eb;

// indicator が null、または座標が有限でない（中点の計算の溢れなど）なら何も足さない
export function renderSiblingReorderIndicator(
  worldContainer: Container,
  constructors: PixiConstructors,
  indicator: SiblingReorderIndicator | null,
): void {
  if (indicator === null) return;
  const { left, right, y } = indicator;
  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(y)) return;
  const width = right - left;
  if (!Number.isFinite(width)) return;

  const graphics = new constructors.Graphics();
  graphics.rect(left, y - INDICATOR_HEIGHT / 2, width, INDICATOR_HEIGHT)
    .fill({ color: INDICATOR_COLOR });
  graphics.eventMode = "none";
  worldContainer.addChild(graphics);
}
