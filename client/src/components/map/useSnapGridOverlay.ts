"use client";

import { useLayoutEffect, useRef } from "react";
import { getViewportWorldRect } from "@/components/map/mapViewport";
import type { RenderedMapScene } from "@/components/map/pixi/renderMapScene";
import {
  computeSnapGridLineRange,
  createSnapGridGraphics,
  drawSnapGrid,
} from "@/components/map/pixi/renderSnapGrid";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { LayoutSnapPrefs } from "@/domain/nodes/snapGrid";
import type { ScreenSize, Viewport } from "@/types/viewport";
import type { Graphics } from "pixi.js";

type UseSnapGridOverlayOptions = {
  runtime: PixiRuntime | null;
  scene: RenderedMapScene | null;
  viewport: Viewport;
  screenSize: ScreenSize | null;
  layoutMode: "manual" | "auto";
  snapPrefs: LayoutSnapPrefs;
};

function viewportTransformKey(viewport: Viewport, screen: ScreenSize): string {
  return `${viewport.offsetX}:${viewport.offsetY}:${viewport.scale}:${screen.width}:${screen.height}`;
}

export function useSnapGridOverlay({
  runtime,
  scene,
  viewport,
  screenSize,
  layoutMode,
  snapPrefs,
}: UseSnapGridOverlayOptions): void {
  const graphicsRef = useRef<Graphics | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const lastStepRef = useRef<number | null>(null);

  const shouldShow = layoutMode === "manual"
    && snapPrefs.enabled
    && snapPrefs.showGrid
    && screenSize !== null;

  useLayoutEffect(() => {
    const worldContainer = scene?.worldContainer ?? null;

    if (!runtime || !worldContainer || !shouldShow) {
      const graphics = graphicsRef.current;
      if (graphics && graphics.parent) {
        graphics.parent.removeChild(graphics);
        graphics.destroy();
      }
      graphicsRef.current = null;
      lastKeyRef.current = null;
      lastStepRef.current = null;
      return;
    }

    let graphics = graphicsRef.current;
    if (!graphics || graphics.destroyed) {
      graphics = createSnapGridGraphics(runtime.constructors);
      graphicsRef.current = graphics;
      worldContainer.addChildAt(graphics, 0);
    } else if (graphics.parent !== worldContainer) {
      graphics.parent?.removeChild(graphics);
      worldContainer.addChildAt(graphics, 0);
    }

    const key = viewportTransformKey(viewport, screenSize);
    const step = snapPrefs.gridStep;
    if (lastKeyRef.current === key && lastStepRef.current === step) {
      // L-526: 同一 transform の連続イベントではジオメトリを再計算しない
      return;
    }

    lastKeyRef.current = key;
    lastStepRef.current = step;

    const worldRect = getViewportWorldRect(viewport, screenSize);
    const range = computeSnapGridLineRange(worldRect, step);
    if (range === null) {
      graphics.clear();
      return;
    }
    drawSnapGrid(graphics, range, step);
  }, [
    runtime,
    scene,
    viewport,
    screenSize,
    shouldShow,
    snapPrefs.gridStep,
    layoutMode,
    snapPrefs.enabled,
    snapPrefs.showGrid,
  ]);
}