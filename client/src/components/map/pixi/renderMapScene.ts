import type { Viewport } from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import { clearMapScene } from "@/components/map/pixi/clearMapScene";
import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import { collectVisibleMapKeys } from "@/components/map/pixi/mapVisibilityKeys";
import type { MarqueeRect } from "@/components/map/pixi/marqueeSelectGesture";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import { renderMapEdges } from "@/components/map/pixi/renderMapEdges";
import { renderMapGroups } from "@/components/map/pixi/renderMapGroups";
import { renderMapNodes, type RenderMapNodesOptions } from "@/components/map/pixi/renderMapNodes";
import { renderMapRelations } from "@/components/map/pixi/renderMapRelations";
import { renderMarquee } from "@/components/map/pixi/renderMarquee";
import { renderSiblingReorderIndicator } from "@/components/map/pixi/renderSiblingReorderIndicator";
import type { SiblingReorderIndicator } from "@/components/map/siblingReorderDropSlot";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { Application, Container, FederatedPointerEvent } from "pixi.js";

export type RenderMapSceneOptions = Omit<RenderMapNodesOptions, "visibleKeys"> & {
  viewport: Viewport;
  visibleNodeIds?: ReadonlySet<number>;
  siblingReorderIndicator: SiblingReorderIndicator | null;
  marqueeRect?: MarqueeRect | null;
  relations?: readonly MapRelation[];
  selectedRelationId?: number | null;
  onRelationPointerDown?: (relationId: number, event: FederatedPointerEvent) => void;
  groups?: readonly MapGroup[];
  selectedGroupId?: number | null;
  onGroupPointerDown?: (groupId: number, event: FederatedPointerEvent) => void;
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
  const visibleNodeIds = options.visibleNodeIds
    ?? new Set(options.nodes.map((node) => node.id));
  const visibleKeys = options.visibleNodeIds === undefined
    ? undefined
    : collectVisibleMapKeys(options.nodes, options.visibleNodeIds);
  // ヒット優先: ノード > 関連線 > グループ。背面から描き、ノードを最前面に
  renderMapGroups(worldContainer, constructors, {
    groups: options.groups,
    nodes: options.nodes,
    visibleNodeIds,
    selectedGroupId: options.selectedGroupId ?? null,
    onGroupPointerDown: options.onGroupPointerDown ?? (() => {}),
  });
  renderMapRelations(worldContainer, constructors, {
    relations: options.relations,
    nodes: options.nodes,
    visibleNodeIds,
    highlightNodeIds: options.highlightNodeIds,
    selectedRelationId: options.selectedRelationId ?? null,
    onRelationPointerDown: options.onRelationPointerDown ?? (() => {}),
  });
  const edgeTargets = renderMapEdges(
    worldContainer,
    constructors,
    options.nodes,
    visibleKeys,
    options.highlightNodeIds,
  );
  const nodeTargets = renderMapNodes(worldContainer, constructors, { ...options, visibleKeys });
  // ノードと接続線の上に重ねる。可視性のターゲットには入れない
  renderSiblingReorderIndicator(worldContainer, constructors, options.siblingReorderIndicator);
  renderMarquee(worldContainer, constructors, options.marqueeRect ?? null);
  app.stage.addChild(worldContainer);
  return {
    worldContainer,
    visibilityTargets: new Map([...edgeTargets, ...nodeTargets]),
  };
}
