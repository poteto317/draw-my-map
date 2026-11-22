"use client";

import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { getViewportWorldRect, type ScreenSize, type Viewport } from "@/components/map/mapViewport";
import {
  computeNodesWorldBounds,
  createMinimapTransform,
  MINIMAP_DEFAULT_HEIGHT,
  MINIMAP_DEFAULT_WIDTH,
  MINIMAP_MAX_DRAW_NODES,
  MINIMAP_PADDING,
  minimapToWorld,
  thinMinimapNodes,
  worldRectToMinimapRect,
  type MinimapPoint,
} from "@/domain/nodes/minimapGeometry";
import type { Node } from "@/types/node";

export const MINIMAP_VISIBLE_FILL = "#3b82f6";
export const MINIMAP_DIMMED_FILL = "#94a3b8";
export const MINIMAP_DIMMED_ALPHA = 0.35;
const BACKGROUND_FILL = "#f8fafc";

export type MinimapProps = {
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  viewport: Viewport;
  screenSize: ScreenSize;
  onPanToWorldPoint: (worldPoint: MinimapPoint) => void;
};

export function Minimap({
  nodes,
  visibleNodeIds,
  viewport,
  screenSize,
  onPanToWorldPoint,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const worldBounds = useMemo(() => computeNodesWorldBounds(nodes), [nodes]);
  const transform = useMemo(() => {
    if (worldBounds === null) return null;
    return createMinimapTransform(
      worldBounds,
      { width: MINIMAP_DEFAULT_WIDTH, height: MINIMAP_DEFAULT_HEIGHT },
      MINIMAP_PADDING,
    );
  }, [worldBounds]);

  const viewportRect = useMemo(() => {
    if (transform === null) return null;
    return worldRectToMinimapRect(getViewportWorldRect(viewport, screenSize), transform);
  }, [screenSize, transform, viewport]);

  const drawNodes = useMemo(
    () => thinMinimapNodes(nodes, MINIMAP_MAX_DRAW_NODES),
    [nodes],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || transform === null) return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      // jsdom など 2d 未実装環境では描画を省略する
      return;
    }
    if (context === null) return;

    context.clearRect(0, 0, MINIMAP_DEFAULT_WIDTH, MINIMAP_DEFAULT_HEIGHT);
    context.globalAlpha = 1;
    context.fillStyle = BACKGROUND_FILL;
    context.fillRect(0, 0, MINIMAP_DEFAULT_WIDTH, MINIMAP_DEFAULT_HEIGHT);

    for (const node of drawNodes) {
      if (visibleNodeIds.has(node.id)) {
        context.globalAlpha = 1;
        context.fillStyle = MINIMAP_VISIBLE_FILL;
      } else {
        context.globalAlpha = MINIMAP_DIMMED_ALPHA;
        context.fillStyle = MINIMAP_DIMMED_FILL;
      }
      const x = node.x * transform.scale + transform.offsetX;
      const y = node.y * transform.scale + transform.offsetY;
      const width = Math.max(1, node.width * transform.scale);
      const height = Math.max(1, node.height * transform.scale);
      context.fillRect(x, y, width, height);
    }
    context.globalAlpha = 1;
  }, [drawNodes, transform, visibleNodeIds]);

  const panFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (canvas === null || transform === null) return;
    const bounds = canvas.getBoundingClientRect();
    const local = {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
    onPanToWorldPoint(minimapToWorld(local, transform));
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || transform === null) return;
    event.preventDefault();
    draggingRef.current = true;
    panFromClient(event.clientX, event.clientY);
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    panFromClient(event.clientX, event.clientY);
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
  };

  return (
    <div
      role="group"
      aria-label="ミニマップ"
      className="pointer-events-auto absolute bottom-3 left-3 z-10 overflow-hidden rounded-md border border-zinc-300 bg-white/90 shadow-sm dark:border-zinc-600 dark:bg-zinc-800/90"
      style={{ width: MINIMAP_DEFAULT_WIDTH, height: MINIMAP_DEFAULT_HEIGHT }}
    >
      {nodes.length === 0 || transform === null ? (
        <p role="status" aria-label="ミニマップ空" className="p-2 text-xs text-zinc-500 dark:text-zinc-400">
          ノードがありません
        </p>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={MINIMAP_DEFAULT_WIDTH}
            height={MINIMAP_DEFAULT_HEIGHT}
            className="block cursor-crosshair touch-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {viewportRect !== null && (
            <div
              data-testid="minimap-viewport-rect"
              className="pointer-events-none absolute border border-rose-500 bg-rose-500/10"
              style={{
                left: viewportRect.x,
                top: viewportRect.y,
                width: Math.max(2, viewportRect.width),
                height: Math.max(2, viewportRect.height),
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
