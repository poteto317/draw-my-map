"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  type ScreenSize,
  type Viewport,
} from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import {
  renderMapScene,
  type RenderedMapScene,
  type RenderMapSceneOptions,
} from "@/components/map/pixi/renderMapScene";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useViewportCulledRenderNodes } from "@/hooks/useViewportCulledRenderNodes";

type UseRenderedMapSceneOptions = {
  runtime: PixiRuntime | null;
  options: Omit<RenderMapSceneOptions, "viewport" | "onNodePointerDown"> & {
    createNodePointerDownHandler: () => RenderMapSceneOptions["onNodePointerDown"];
  };
  viewport: Viewport;
  viewportRef: RefObject<Viewport>;
  /** 未計測時は null。必須（L-060: 省略でカリング配線漏れを隠さない） */
  screenSize: ScreenSize | null;
};

export function useRenderedMapScene({
  runtime,
  options,
  viewport,
  viewportRef,
  screenSize,
}: UseRenderedMapSceneOptions): RenderedMapScene | null {
  const {
    nodes,
    selectedNodeIds,
    editingNodeId,
    connectionTargetNodeId,
    marqueeRect = null,
    siblingReorderSourceNodeId,
    siblingReorderIndicator,
    createNodePointerDownHandler,
    visibleNodeIds,
    highlightNodeIds,
    pinnedNodeIds,
    illustrationTextures,
    relations,
    selectedRelationId = null,
    onRelationPointerDown,
    groups,
    selectedGroupId = null,
    onGroupPointerDown,
  } = options;
  const sceneRef = useRef<RenderedMapScene | null>(null);
  const appliedViewportRef = useRef<Viewport | null>(null);
  const [scene, setScene] = useState<RenderedMapScene | null>(null);
  // 親の callback 差し替えだけで scene を再生成しない（keydown 登録と同様）
  const onRelationPointerDownRef = useLatestRef(onRelationPointerDown);
  const onGroupPointerDownRef = useLatestRef(onGroupPointerDown);

  const requiredCullNodeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const id of selectedNodeIds) ids.add(id);
    if (editingNodeId !== null) ids.add(editingNodeId);
    if (connectionTargetNodeId !== null) ids.add(connectionTargetNodeId);
    if (siblingReorderSourceNodeId !== null) ids.add(siblingReorderSourceNodeId);
    // 関連線の両端・グループメンバーはカリングで落とさない（描画・ヒットに座標が必要）
    for (const relation of relations ?? []) {
      ids.add(relation.fromId);
      ids.add(relation.toId);
    }
    for (const group of groups ?? []) {
      for (const id of group.nodeIds) ids.add(id);
    }
    return ids;
  }, [
    connectionTargetNodeId,
    editingNodeId,
    selectedNodeIds,
    siblingReorderSourceNodeId,
    relations,
    groups,
  ]);

  const renderNodes = useViewportCulledRenderNodes(
    nodes,
    viewport,
    screenSize,
    requiredCullNodeIds,
  );

  useEffect(() => {
    if (!runtime) return;

    const renderedViewport = viewportRef.current;
    const renderedScene = renderMapScene(runtime.app, runtime.constructors, {
      nodes: renderNodes,
      selectedNodeIds,
      editingNodeId,
      connectionTargetNodeId,
      marqueeRect,
      siblingReorderSourceNodeId,
      siblingReorderIndicator,
      visibleNodeIds,
      highlightNodeIds,
      pinnedNodeIds,
      illustrationTextures,
      relations,
      selectedRelationId,
      onRelationPointerDown: onRelationPointerDownRef.current === undefined
        ? undefined
        : (relationId, event) => onRelationPointerDownRef.current?.(relationId, event),
      groups,
      selectedGroupId,
      onGroupPointerDown: onGroupPointerDownRef.current === undefined
        ? undefined
        : (groupId, event) => onGroupPointerDownRef.current?.(groupId, event),
      onNodePointerDown: createNodePointerDownHandler(),
      viewport: renderedViewport,
    });
    sceneRef.current = renderedScene;
    appliedViewportRef.current = renderedViewport;
    setScene(renderedScene);

    return () => {
      if (sceneRef.current !== renderedScene) return;
      sceneRef.current = null;
      appliedViewportRef.current = null;
      setScene(null);
    };
  }, [
    runtime,
    renderNodes,
    selectedNodeIds,
    editingNodeId,
    connectionTargetNodeId,
    marqueeRect,
    siblingReorderSourceNodeId,
    siblingReorderIndicator,
    createNodePointerDownHandler,
    visibleNodeIds,
    highlightNodeIds,
    pinnedNodeIds,
    illustrationTextures,
    relations,
    selectedRelationId,
    onRelationPointerDownRef,
    groups,
    selectedGroupId,
    onGroupPointerDownRef,
  ]);

  useEffect(() => {
    const worldContainer = sceneRef.current?.worldContainer;
    if (!worldContainer || appliedViewportRef.current === viewport) return;
    applyViewportTransform(worldContainer, viewport);
    appliedViewportRef.current = viewport;
  }, [viewport]);

  return scene;
}
