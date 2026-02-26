"use client";

import { useEffect, useRef, useState } from "react";
import type { Rect } from "@/types/rect";
import type { Application, Graphics as GraphicsType } from "pixi.js";

type MapStageProps = {
  rects: Rect[];
  onDoubleClick: (x: number, y: number) => void;
};

export function MapStage({ rects, onDoubleClick }: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const GraphicsClassRef = useRef<typeof GraphicsType | null>(null);
  const [appReady, setAppReady] = useState(false);

  // PixiJS アプリの初期化
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const pixi = await import("pixi.js");
      if (cancelled) return;

      GraphicsClassRef.current = pixi.Graphics;

      const app = new pixi.Application();
      await app.init({
        backgroundAlpha: 0,
        resizeTo: containerRef.current!,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (cancelled) {
        app.destroy(true);
        return;
      }

      const canvas = app.canvas;
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      containerRef.current!.appendChild(canvas);
      appRef.current = app;
      setAppReady(true);
    })();

    return () => {
      cancelled = true;
      appRef.current?.destroy(true);
      appRef.current = null;
      setAppReady(false);
    };
  }, []);

  // rects の変化を PixiJS に反映
  useEffect(() => {
    const app = appRef.current;
    const Graphics = GraphicsClassRef.current;
    if (!app || !Graphics) return;

    app.stage.removeChildren();

    for (const rect of rects) {
      const g = new Graphics();
      g.rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color: 0xffffff })
        .stroke({ width: 2, color: 0x3b82f6 });
      app.stage.addChild(g);
    }
  }, [rects, appReady]);

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bounds = containerRef.current!.getBoundingClientRect();
    onDoubleClick(e.clientX - bounds.left, e.clientY - bounds.top);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-crosshair"
      style={{ minHeight: "calc(100vh - 52px)" }}
      onDoubleClick={handleDoubleClick}
    />
  );
}
