import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import { nodeVisibilityKey } from "@/components/map/pixi/mapVisibilityKeys";
import { createNodeVisibilityTarget } from "@/components/map/pixi/pixiVisibilityTarget";
import { HIGHLIGHT_DIM_ALPHA } from "@/domain/nodes/highlightSets";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { getNodeIllustrationRect, getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";
import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent, Graphics, Sprite, Text, Texture } from "pixi.js";

export type RenderMapNodesOptions = {
  nodes: readonly Node[];
  selectedNodeIds: readonly number[];
  editingNodeId: number | null;
  connectionTargetNodeId: number | null;
  // 並べ替えのドラッグ中のノード。元の位置で半透明にする
  siblingReorderSourceNodeId: number | null;
  onNodePointerDown: (nodeId: number, event: FederatedPointerEvent) => void;
  visibleKeys?: ReadonlySet<string>;
  /** 空集合 = 強調オフ（全ノード通常 alpha）。省略不可（L-060） */
  highlightNodeIds: ReadonlySet<number>;
  /** ピン済みノード。空集合 = 印なし */
  pinnedNodeIds: ReadonlySet<number>;
  // キーは data URL
  illustrationTextures?: ReadonlyMap<string, Texture>;
};

const DRAGGED_NODE_ALPHA = 0.5;

function resolveNodeContentAlpha(
  nodeId: number,
  options: Pick<RenderMapNodesOptions, "siblingReorderSourceNodeId" | "highlightNodeIds">,
): number {
  let contentAlpha = 1;
  if (nodeId === options.siblingReorderSourceNodeId) {
    contentAlpha = Math.min(contentAlpha, DRAGGED_NODE_ALPHA);
  }
  if (options.highlightNodeIds.size > 0 && !options.highlightNodeIds.has(nodeId)) {
    contentAlpha = Math.min(contentAlpha, HIGHLIGHT_DIM_ALPHA);
  }
  return contentAlpha;
}
const NODE_BORDER_COLOR = 0x3b82f6;

// 「リンクあり」の印。ノードの右上の角に重ねる小さな円（枠の通常色 `NODE_BORDER_COLOR` と同じ青、白い縁）。キャンバス表示専用で、画像書き出しには出さない
const LINK_MARKER_RADIUS = 6;
const LINK_MARKER_COLOR = NODE_BORDER_COLOR;
const LINK_MARKER_BORDER_WIDTH = 2;
const LINK_MARKER_BORDER_COLOR = 0xffffff;

function createNodeShape(
  constructors: PixiConstructors,
  node: Node,
  state: { isSelected: boolean; isConnectionTarget: boolean },
): Graphics {
  const { isSelected, isConnectionTarget } = state;
  const graphics = new constructors.Graphics();
  graphics.rect(node.x, node.y, node.width, node.height)
    .fill({ color: isConnectionTarget ? 0xecfdf5 : isSelected ? 0xeff6ff : 0xffffff })
    .stroke({
      width: isConnectionTarget || isSelected ? 3 : 2,
      color: isConnectionTarget ? 0x10b981 : isSelected ? 0x2563eb : NODE_BORDER_COLOR,
    });
  return graphics;
}

function createNodeIllustrationSprite(
  constructors: PixiConstructors,
  node: Node,
  textures: ReadonlyMap<string, Texture> | undefined,
): Sprite | null {
  const illustrationTexture = node.illustration === undefined
    ? undefined
    : textures?.get(node.illustration);
  if (illustrationTexture === undefined) return null;

  const rect = getNodeIllustrationRect(node);
  const sprite = new constructors.Sprite(illustrationTexture);
  sprite.x = rect.x;
  sprite.y = rect.y;
  sprite.width = rect.size;
  sprite.height = rect.size;
  return sprite;
}

// URL を 1 件以上持つノードだけに印を作る。中心は右上の角（x + width, y）なので、ラベル（折り返し幅 width - 16）にも
// イラスト（中央）にも重ならない。選択・接続先の色には影響されない。eventMode は親の Container のまま（表示専用）
function createNodeLinkMarker(constructors: PixiConstructors, node: Node): Graphics | null {
  if (node.links === undefined || node.links.length === 0) return null;
  const marker = new constructors.Graphics();
  marker.circle(node.x + node.width, node.y, LINK_MARKER_RADIUS)
    .fill({ color: LINK_MARKER_COLOR })
    .stroke({ width: LINK_MARKER_BORDER_WIDTH, color: LINK_MARKER_BORDER_COLOR });
  return marker;
}

// ピン印。左上の角を中心にした琥珀色の円（白い縁）。リンク印（右上・青）と位置・色で区別する。表示専用
const PIN_MARKER_RADIUS = 6;
const PIN_MARKER_COLOR = 0xf59e0b;
const PIN_MARKER_BORDER_WIDTH = 2;
const PIN_MARKER_BORDER_COLOR = 0xffffff;

function createNodePinMarker(
  constructors: PixiConstructors,
  node: Node,
  pinnedNodeIds: ReadonlySet<number>,
): Graphics | null {
  if (!pinnedNodeIds.has(node.id)) return null;
  const marker = new constructors.Graphics();
  marker.circle(node.x, node.y, PIN_MARKER_RADIUS)
    .fill({ color: PIN_MARKER_COLOR })
    .stroke({ width: PIN_MARKER_BORDER_WIDTH, color: PIN_MARKER_BORDER_COLOR });
  return marker;
}

function createNodeLabelText(constructors: PixiConstructors, node: Node): Text {
  const text = new constructors.Text({
    text: getNodeDisplayLabel(node.label),
    style: {
      fontSize: 14,
      fill: 0x27272a,
      wordWrap: true,
      wordWrapWidth: node.width - 16,
      align: "center",
    },
  });
  text.anchor.set(0.5);
  text.x = node.x + node.width / 2;
  text.y = node.y + getNodeLabelCenterOffset(node);
  return text;
}

export function renderMapNodes(
  stage: Container,
  constructors: PixiConstructors,
  options: RenderMapNodesOptions,
): Map<string, MapVisibilityTarget> {
  const visibilityTargets = new Map<string, MapVisibilityTarget>();
  const selectedIds = new Set(options.selectedNodeIds);
  for (const node of options.nodes) {
    const visibilityKey = nodeVisibilityKey(node.id);
    const isVisible = options.visibleKeys?.has(visibilityKey) ?? true;
    const isEditing = node.id === options.editingNodeId;
    const isSelected = selectedIds.has(node.id);
    const isConnectionTarget = node.id === options.connectionTargetNodeId;
    // Container の alpha は表示のフェードが使うので、子要素の alpha で半透明にする
    const contentAlpha = resolveNodeContentAlpha(node.id, options);
    const container = new constructors.Container();
    container.alpha = isVisible ? 1 : 0;
    container.visible = isVisible;
    container.eventMode = isVisible ? "static" : "none";
    container.cursor = isVisible ? "pointer" : "default";
    container.on("pointerdown", (event: FederatedPointerEvent) => {
      options.onNodePointerDown(node.id, event);
    });

    const shape = createNodeShape(constructors, node, { isSelected, isConnectionTarget });
    shape.alpha = contentAlpha;
    container.addChild(shape);

    const sprite = createNodeIllustrationSprite(constructors, node, options.illustrationTextures);
    if (sprite !== null) {
      sprite.alpha = contentAlpha;
      container.addChild(sprite);
    }

    if (!isEditing) {
      const text = createNodeLabelText(constructors, node);
      text.alpha = contentAlpha;
      container.addChild(text);
    }

    const marker = createNodeLinkMarker(constructors, node);
    if (marker !== null) {
      marker.alpha = contentAlpha;
      container.addChild(marker);
    }

    const pinMarker = createNodePinMarker(constructors, node, options.pinnedNodeIds);
    if (pinMarker !== null) {
      pinMarker.alpha = contentAlpha;
      container.addChild(pinMarker);
    }

    stage.addChild(container);
    visibilityTargets.set(
      visibilityKey,
      createNodeVisibilityTarget(visibilityKey, container),
    );
  }
  return visibilityTargets;
}
