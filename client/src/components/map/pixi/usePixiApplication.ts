"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Application } from "pixi.js";
import type { PixiRuntime } from "./pixiTypes";

export type { PixiRuntime } from "./pixiTypes";

export function usePixiApplication(
  containerRef: RefObject<HTMLDivElement | null>,
): PixiRuntime | null {
  const [runtime, setRuntime] = useState<PixiRuntime | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let initialized = false;
    let destroyed = false;
    let app: Application | null = null;
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
      container.appendChild(createdApp.canvas);
      setRuntime({
        app: createdApp,
        constructors: {
          Graphics: pixi.Graphics,
          Text: pixi.Text,
          Container: pixi.Container,
        },
      });
    })();

    return () => {
      cancelled = true;
      if (initialized) destroy();
    };
  }, [containerRef]);

  return runtime;
}
