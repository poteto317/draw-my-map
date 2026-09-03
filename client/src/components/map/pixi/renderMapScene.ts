import type { Viewport } from "@/components/map/mapViewport";
import { clearMapScene } from "@/components/map/pixi/clearMapScene";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import { renderMapEdges } from "@/components/map/pixi/renderMapEdges";
import { renderMapNodes, type RenderMapNodesOptions } from "@/components/map/pixi/renderMapNodes";
import type { Application } from "pixi.js";

export type RenderMapSceneOptions = RenderMapNodesOptions & {
  viewport: Viewport;
};

export function renderMapScene(
  app: Application,
  constructors: PixiConstructors,
  options: RenderMapSceneOptions,
): void {
  clearMapScene(app);
  const worldContainer = new constructors.Container();
  worldContainer.position.set(options.viewport.offsetX, options.viewport.offsetY);
  worldContainer.scale.set(options.viewport.scale);
  renderMapEdges(worldContainer, constructors, options.nodes);
  renderMapNodes(worldContainer, constructors, options);
  app.stage.addChild(worldContainer);
}
