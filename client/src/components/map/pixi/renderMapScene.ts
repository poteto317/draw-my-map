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
import { renderMapPresenceMarkers } from "@/components/map/pixi/renderMapPresenceMarkers";
import { renderMapRelations } from "@/components/map/pixi/renderMapRelations";
import { renderMarquee } from "@/components/map/pixi/renderMarquee";
import { renderSiblingReorderIndicator } from "@/components/map/pixi/renderSiblingReorderIndicator";
import type { SiblingReorderIndicator } from "@/components/map/siblingReorderDropSlot";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";
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
  /** 非完備時は省略＝描かない（L-002）。両方揃ったときだけマーカー層を追加 */
  presenceNodeIds?: ReadonlySet<number>;
  /** child id 配列のみ（keys 文字列は作らない） */
  presenceEdgeChildIds?: readonly number[];
  /**
   * presence 座標用の表示座標全体。省略時は `nodes`（後方互換）。
   * フル描画の `nodes` は cull 済みのままにし、presence 端点を混ぜない。
   */
  presenceNodes?: readonly Node[];
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
  // presence: 線は通常 nodes の前、点は通常 nodes の後（可視性ターゲットには入れない）
  // 座標は presenceNodes（表示座標全体）。フル描画用 nodes には端点をマージしない
  const presenceLayers = options.presenceNodeIds !== undefined
      && options.presenceEdgeChildIds !== undefined
    ? renderMapPresenceMarkers(constructors, {
      nodes: options.presenceNodes ?? options.nodes,
      presenceNodeIds: options.presenceNodeIds,
      presenceEdgeChildIds: options.presenceEdgeChildIds,
      scale: options.viewport.scale,
    })
    : null;
  if (presenceLayers) {
    worldContainer.addChild(presenceLayers.edges);
  }
  const nodeTargets = renderMapNodes(worldContainer, constructors, { ...options, visibleKeys });
  if (presenceLayers) {
    worldContainer.addChild(presenceLayers.markers);
  }
  // ノードと接続線の上に重ねる。可視性のターゲットには入れない
  renderSiblingReorderIndicator(worldContainer, constructors, options.siblingReorderIndicator);
  renderMarquee(worldContainer, constructors, options.marqueeRect ?? null);
  app.stage.addChild(worldContainer);
  return {
    worldContainer,
    visibilityTargets: new Map([...edgeTargets, ...nodeTargets]),
  };
}
