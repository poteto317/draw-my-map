export type Viewport = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type ScreenSize = { width: number; height: number };

export const INITIAL_VIEWPORT: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
export const MIN_VIEWPORT_SCALE = 0.25;
export const MAX_VIEWPORT_SCALE = 4;

export function isValidScreenSize(screen: ScreenSize): boolean {
  return Number.isFinite(screen.width) && screen.width > 0
    && Number.isFinite(screen.height) && screen.height > 0;
}

export function isValidViewport(viewport: Viewport): boolean {
  return Number.isFinite(viewport.offsetX)
    && Number.isFinite(viewport.offsetY)
    && Number.isFinite(viewport.scale)
    && viewport.scale >= MIN_VIEWPORT_SCALE
    && viewport.scale <= MAX_VIEWPORT_SCALE;
}

export function clampViewportScale(scale: number): number {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale));
}
