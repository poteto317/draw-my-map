"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Application } from "pixi.js";
import type { ScreenSize } from "@/components/map/mapViewport";
import type { PixiRuntime } from "./pixiTypes";

export type { PixiRuntime } from "./pixiTypes";

export function usePixiApplication(
  containerRef: RefObject<HTMLDivElement | null>,
  onScreenResize?: (screen: ScreenSize) => void,
): PixiRuntime | null {
  const [runtime, setRuntime] = useState<PixiRuntime | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let initialized = false;
    let destroyed = false;
    let app: Application | null = null;
    const notifyScreenResize = (width: number, height: number) => onScreenResize?.({ width, height });
    const destroy = () => {
      if (app && !destroyed) {
        destroyed = true;
        app.destroy(true, { children: true, context: true });
      }
    };

    void (async () => {
      const pixi = await import("pixi.js");
      if (cancelled) return;

      const createdApp = new pixi.Application();
      app = createdApp;
      await createdApp.init({
        backgroundAlpha: 0,
        resizeTo: container,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      initialized = true;

      if (cancelled) {
        destroy();
        return;
      }

      createdApp.canvas.style.position = "absolute";
      createdApp.canvas.style.inset = "0px";
      createdApp.canvas.style.touchAction = "none";
      container.appendChild(createdApp.canvas);
      if (onScreenResize) {
        createdApp.renderer.on("resize", notifyScreenResize);
        notifyScreenResize(createdApp.screen.width, createdApp.screen.height);
      }
      setRuntime({
        app: createdApp,
        constructors: {
          Graphics: pixi.Graphics,
          Text: pixi.Text,
          Container: pixi.Container,
          Sprite: pixi.Sprite,
          Texture: pixi.Texture,
        },
      });
    })();

    return () => {
      cancelled = true;
      if (initialized && app && !destroyed) {
        if (onScreenResize) app.renderer.off("resize", notifyScreenResize);
        destroy();
      }
    };
  }, [containerRef, onScreenResize]);

  return runtime;
}
