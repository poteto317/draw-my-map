"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import {
  renderMapScene,
  type RenderedMapScene,
  type RenderMapSceneOptions,
} from "@/components/map/pixi/renderMapScene";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";

type UseRenderedMapSceneOptions = {
  runtime: PixiRuntime | null;
  options: Omit<RenderMapSceneOptions, "viewport" | "onNodePointerDown"> & {
    createNodePointerDownHandler: () => RenderMapSceneOptions["onNodePointerDown"];
  };
  viewport: Viewport;
  viewportRef: RefObject<Viewport>;
};

export function useRenderedMapScene({
  runtime,
  options,
  viewport,
  viewportRef,
}: UseRenderedMapSceneOptions): RenderedMapScene | null {
  const {
    nodes,
    selectedNodeId,
    editingNodeId,
    connectionTargetNodeId,
    createNodePointerDownHandler,
    visibleNodeIds,
    illustrationTextures,
  } = options;
  const sceneRef = useRef<RenderedMapScene | null>(null);
  const appliedViewportRef = useRef<Viewport | null>(null);
  const [scene, setScene] = useState<RenderedMapScene | null>(null);

  useEffect(() => {
    if (!runtime) return;

    const renderedViewport = viewportRef.current;
    const renderedScene = renderMapScene(runtime.app, runtime.constructors, {
      nodes,
      selectedNodeId,
      editingNodeId,
      connectionTargetNodeId,
      visibleNodeIds,
      illustrationTextures,
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
    nodes,
    selectedNodeId,
    editingNodeId,
    connectionTargetNodeId,
    createNodePointerDownHandler,
    visibleNodeIds,
    illustrationTextures,
    viewportRef,
  ]);

  useEffect(() => {
    const worldContainer = sceneRef.current?.worldContainer;
    if (!worldContainer || appliedViewportRef.current === viewport) return;
    applyViewportTransform(worldContainer, viewport);
    appliedViewportRef.current = viewport;
  }, [viewport]);

  return scene;
}
