import type { Viewport } from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import { clearMapScene } from "@/components/map/pixi/clearMapScene";
import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import { collectVisibleMapKeys } from "@/components/map/pixi/mapVisibilityKeys";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import { renderMapEdges } from "@/components/map/pixi/renderMapEdges";
import { renderMapNodes, type RenderMapNodesOptions } from "@/components/map/pixi/renderMapNodes";
import { renderSiblingReorderIndicator } from "@/components/map/pixi/renderSiblingReorderIndicator";
import type { SiblingReorderIndicator } from "@/components/map/siblingReorderDropSlot";
import type { Application, Container } from "pixi.js";

export type RenderMapSceneOptions = Omit<RenderMapNodesOptions, "visibleKeys"> & {
  viewport: Viewport;
  visibleNodeIds?: ReadonlySet<number>;
  siblingReorderIndicator: SiblingReorderIndicator | null;
};

export type RenderedMapScene = {
  worldContainer: Container;
  visibilityTargets: Map<string, MapVisibilityTarget>;
};

export function renderMapScene(
  app: Application,
  constructors: PixiConstructors,
  options: RenderMapSceneOptions,
): RenderedMapScene {
  clearMapScene(app);
  const worldContainer = new constructors.Container();
  applyViewportTransform(worldContainer, options.viewport);
  const visibleKeys = options.visibleNodeIds === undefined
    ? undefined
    : collectVisibleMapKeys(options.nodes, options.visibleNodeIds);
  const edgeTargets = renderMapEdges(worldContainer, constructors, options.nodes, visibleKeys);
  const nodeTargets = renderMapNodes(worldContainer, constructors, { ...options, visibleKeys });
  // ノードと接続線の上に重ねる。可視性のターゲットには入れない
  renderSiblingReorderIndicator(worldContainer, constructors, options.siblingReorderIndicator);
  app.stage.addChild(worldContainer);
  return {
    worldContainer,
    visibilityTargets: new Map([...edgeTargets, ...nodeTargets]),
  };
}
