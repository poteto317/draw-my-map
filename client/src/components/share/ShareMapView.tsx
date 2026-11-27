"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fitViewportToNodes,
  type ScreenSize,
} from "@/components/map/mapViewport";
import { EMPTY_COMMENT_NODE_COUNTS } from "@/components/map/pixi/renderMapNodes";
import { usePixiApplication } from "@/components/map/pixi/usePixiApplication";
import { useMapViewport } from "@/components/map/useMapViewport";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";
import { useRenderedMapScene } from "@/components/map/useRenderedMapScene";
import {
  canCollapse,
  createNodeCollapseIndex,
  deriveNodeCollapse,
  toggleCollapsedNode,
} from "@/domain/nodes/nodeCollapse";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import { DEFAULT_WHEEL_ZOOM_SENSITIVITY } from "@/domain/uiPrefs/uiPrefs";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";

type ShareMapViewProps = {
  nodes: readonly Node[];
  relations?: readonly MapRelation[];
  groups?: readonly MapGroup[];
};

const INACTIVE_LEARN_DISPLAY = {
  learningActive: false,
  revealedNodeIds: new Set<number>(),
} as const;

const EMPTY_SELECTED_NODE_IDS: readonly number[] = [];
const EMPTY_HIGHLIGHT_NODE_IDS: ReadonlySet<number> = new Set();
const EMPTY_PINNED_NODE_IDS: ReadonlySet<number> = new Set();
const EMPTY_TASK_PROGRESS: ReadonlyMap<number, { percent: number; remaining: number }> = new Map();

/**
 * 閲覧専用 Pixi マップ（V-RO）。
 * MapStage / MapEditor / コンテキストメニュー / ラベル編集は載せない。
 * usePixiApplication + useRenderedMapScene + viewport / wheel zoom のみ。
 */
export function ShareMapView({ nodes, relations, groups }: ShareMapViewProps) {
  const index = useMemo(() => createNodeCollapseIndex(nodes), [nodes]);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<number>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [screenSize, setScreenSize] = useState<ScreenSize | null>(null);
  const didFitRef = useRef(false);

  const derived = useMemo(() => {
    if (!index) {
      return {
        collapsedNodeIds: collapsedIds,
        visibleNodeIds: new Set(nodes.map((n) => n.id)),
        hiddenCountById: new Map<number, number>(),
      };
    }
    return deriveNodeCollapse(index, collapsedIds);
  }, [index, collapsedIds, nodes]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => derived.visibleNodeIds.has(node.id)),
    [nodes, derived.visibleNodeIds],
  );
  const visibleNodesRef = useLatestRef(visibleNodes);

  const { viewport, viewportRef, setViewport, panBy, zoomAt } = useMapViewport();

  const onScreenResize = useCallback((screen: ScreenSize) => {
    setScreenSize(screen);
    if (didFitRef.current) return;
    const targets = visibleNodesRef.current;
    if (targets.length === 0) return;
    const next = fitViewportToNodes(targets, screen);
    if (!next) return;
    setViewport(next);
    didFitRef.current = true;
  }, [setViewport, visibleNodesRef]);

  const runtime = usePixiApplication(containerRef, onScreenResize);

  const createNodePointerDownHandler = useCallback(() => () => {
    // 閲覧専用: ノード上でも構造編集・選択メニューは起動しない
  }, []);

  useRenderedMapScene({
    runtime,
    options: {
      learnDisplay: INACTIVE_LEARN_DISPLAY,
      taskProgress: EMPTY_TASK_PROGRESS,
      nodes,
      selectedNodeIds: EMPTY_SELECTED_NODE_IDS,
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      siblingReorderIndicator: null,
      createNodePointerDownHandler,
      visibleNodeIds: derived.visibleNodeIds,
      highlightNodeIds: EMPTY_HIGHLIGHT_NODE_IDS,
      pinnedNodeIds: EMPTY_PINNED_NODE_IDS,
      commentNodeCounts: EMPTY_COMMENT_NODE_COUNTS,
      relations,
      groups,
    },
    viewport,
    viewportRef,
    screenSize,
  });

  useMapWheelZoom({
    runtime,
    viewportRef,
    wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
    onBeforeZoom: () => {},
    onPanBy: panBy,
    onZoomAt: zoomAt,
  });

  useEffect(() => {
    if (!runtime) return;
    const canvas = runtime.app.canvas;
    let dragging: { pointerId: number; x: number; y: number } | null = null;

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // capture 非対応環境では move/up の追跡に頼る
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      panBy(event.clientX - dragging.x, event.clientY - dragging.y);
      dragging = { pointerId: dragging.pointerId, x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      if (dragging?.pointerId === event.pointerId) dragging = null;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [runtime, panBy]);

  if (nodes.length === 0) {
    return (
      <div data-testid="share-map-view" className="flex h-full items-center justify-center p-4 text-sm text-zinc-600">
        {SHARE_MESSAGES.viewEmpty}
      </div>
    );
  }

  const collapsibleVisible = index
    ? visibleNodes.filter((node) => canCollapse(index, node.id))
    : [];

  return (
    <div
      data-testid="share-map-view"
      className="relative flex h-full min-h-[240px] flex-col bg-zinc-50"
      aria-label="マップ"
    >
      {collapsibleVisible.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-zinc-200 bg-white px-3 py-2">
          {collapsibleVisible.slice(0, 12).map((node) => {
            const isCollapsed = derived.collapsedNodeIds.has(node.id);
            const label = node.label || "（無題）";
            return (
              <button
                key={node.id}
                type="button"
                className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
                aria-expanded={!isCollapsed}
                aria-label={`${label}を${isCollapsed ? SHARE_MESSAGES.viewExpand : SHARE_MESSAGES.viewCollapse}`}
                onClick={() => {
                  if (!index) return;
                  setCollapsedIds((current) => toggleCollapsedNode(index, current, node.id));
                }}
              >
                {isCollapsed ? "▸" : "▾"} {label}
              </button>
            );
          })}
        </div>
      )}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 touch-none"
      />
    </div>
  );
}
