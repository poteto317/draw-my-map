import type { Viewport } from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import { clearMapScene } from "@/components/map/pixi/clearMapScene";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import { renderMapEdges } from "@/components/map/pixi/renderMapEdges";
import { renderMapNodes, type RenderMapNodesOptions } from "@/components/map/pixi/renderMapNodes";
import type { Application, Container } from "pixi.js";

export type RenderMapSceneOptions = RenderMapNodesOptions & {
  viewport: Viewport;
};

export function renderMapScene(
  app: Application,
  constructors: PixiConstructors,
  options: RenderMapSceneOptions,
): Container {
  clearMapScene(app);
  const worldContainer = new constructors.Container();
  applyViewportTransform(worldContainer, options.viewport);
  renderMapEdges(worldContainer, constructors, options.nodes);
  renderMapNodes(worldContainer, constructors, options);
  app.stage.addChild(worldContainer);
  return worldContainer;
}
