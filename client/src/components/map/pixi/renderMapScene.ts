import { clearMapScene } from "@/components/map/pixi/clearMapScene";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import { renderMapEdges } from "@/components/map/pixi/renderMapEdges";
import { renderMapNodes, type RenderMapNodesOptions } from "@/components/map/pixi/renderMapNodes";
import type { Application } from "pixi.js";

export type RenderMapSceneOptions = RenderMapNodesOptions;

export function renderMapScene(
  app: Application,
  constructors: PixiConstructors,
  options: RenderMapSceneOptions,
): void {
  clearMapScene(app);
  renderMapEdges(app.stage, constructors, options.nodes);
  renderMapNodes(app.stage, constructors, options);
}
