import type { TaskProgress } from "@/domain/nodes/nodeTaskProgress";
import {
  computeTaskProgressMapLabelLayout,
  formatTaskProgressMapBadgeText,
  resolveTaskProgressMapBody,
  shouldShowTaskProgressMapBadge,
} from "@/domain/nodes/nodeTaskProgressMapLayout";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import { nodeVisibilityKey } from "@/components/map/pixi/mapVisibilityKeys";
import { createNodeVisibilityTarget } from "@/components/map/pixi/pixiVisibilityTarget";
import { HIGHLIGHT_DIM_ALPHA } from "@/domain/nodes/highlightSets";
import {
  resolveLabelTextPresentation,
  resolveLabelUnderline,
} from "@/domain/nodes/labelTextStyle";
import {
  resolveLearnLabelDisplay,
  type LearnLabelDisplayContext,
} from "@/domain/map/mapLearnMode";
import {
  getNodeIconCenterX,
  NODE_ICON_DISPLAY_SIZE_PX,
} from "@/domain/nodes/nodeIcon";
import { getNodeIllustrationRect, getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";
import {
  NODE_LABEL_HORIZONTAL_PADDING,
  ellipsizeWrappedLabel,
  nodeLabelContentHeightBudget,
} from "@/domain/nodes/nodeLabelLayout";
import type { Node } from "@/types/node";
import {
  NODE_KIND_BAR_FALLBACK_COLORS,
  NODE_KIND_BAR_WIDTH_PX,
  type NodeKind,
} from "@/types/nodeKind";
import { createNodeHitArea } from "@/components/map/pixi/nodeHitArea";
import type { Container, FederatedPointerEvent, Graphics, Sprite, Text, Texture } from "pixi.js";

const NODE_LABEL_FILL = 0x27272a;
const NODE_LABEL_UNDERLINE_STROKE_WIDTH = 1;
const NODE_LABEL_UNDERLINE_GAP = 1;

function nodeKindBarPixiColor(kind: NodeKind): number {
  return Number.parseInt(NODE_KIND_BAR_FALLBACK_COLORS[kind].slice(1), 16);
}

export type RenderMapNodesOptions = {
  nodes: readonly Node[];
  /** 省略不可（L-060） */
  learnDisplay: LearnLabelDisplayContext;
  taskProgress: ReadonlyMap<number, TaskProgress>;
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
  /** 未解決コメントスレッド数。0 のノードはキーを持たない。空 Map = 印なし。省略不可（L-060） */
  commentNodeCounts: ReadonlyMap<number, number>;
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
const LOCKED_NODE_BORDER_COLOR = 0x71717a;

// 「リンクあり」の印。ノードの右上の角に重ねる小さな円（枠の通常色 `NODE_BORDER_COLOR` と同じ青、白い縁）。キャンバス表示専用で、画像書き出しには出さない
const LINK_MARKER_RADIUS = 6;
const LINK_MARKER_COLOR = NODE_BORDER_COLOR;
const LINK_MARKER_BORDER_WIDTH = 2;
const LINK_MARKER_BORDER_COLOR = 0xffffff;

function createNodeShape(
  constructors: PixiConstructors,
  node: Node,
  state: { isSelected: boolean; isConnectionTarget: boolean; isLocked: boolean },
): Graphics {
  const { isSelected, isConnectionTarget, isLocked } = state;
  const graphics = new constructors.Graphics();
  const borderColor = isConnectionTarget
    ? 0x10b981
    : isSelected
      ? 0x2563eb
      : isLocked
        ? LOCKED_NODE_BORDER_COLOR
        : NODE_BORDER_COLOR;
  graphics.rect(node.x, node.y, node.width, node.height)
    .fill({ color: isConnectionTarget ? 0xecfdf5 : isSelected ? 0xeff6ff : 0xffffff })
    .stroke({
      width: isConnectionTarget || isSelected ? 3 : 2,
      color: borderColor,
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

// 編集ロックの印。右下の角を中心にした zinc 色の円（白い縁）。ピン・リンク印と位置で区別する
const LOCK_MARKER_RADIUS = 6;
const LOCK_MARKER_COLOR = LOCKED_NODE_BORDER_COLOR;
const LOCK_MARKER_BORDER_WIDTH = 2;
const LOCK_MARKER_BORDER_COLOR = 0xffffff;

function createNodeLockMarker(constructors: PixiConstructors, node: Node): Graphics | null {
  if (node.locked !== true) return null;
  const marker = new constructors.Graphics();
  marker.circle(node.x + node.width, node.y + node.height, LOCK_MARKER_RADIUS)
    .fill({ color: LOCK_MARKER_COLOR })
    .stroke({ width: LOCK_MARKER_BORDER_WIDTH, color: LOCK_MARKER_BORDER_COLOR });
  return marker;
}

// コメント件数バッジ。左下の角を中心にした青い円と白い件数。左上=ピン・右上=リンク・右下=ロックの角印と
// 進捗バッジ（下段中央）に重ならない位置にする。表示専用
export const COMMENT_BADGE_RADIUS = 7;
const COMMENT_BADGE_COLOR = 0x2563eb;
const COMMENT_BADGE_TEXT_COLOR = 0xffffff;
const COMMENT_BADGE_FONT_SIZE = 9;
const COMMENT_BADGE_MAX_EXACT_COUNT = 9;

/** 印なしの共有定数。印を出さない描画元（ShareMapView の view リンク・テスト用ハーネス）がここから import する */
export const EMPTY_COMMENT_NODE_COUNTS: ReadonlyMap<number, number> = new Map();

export function formatCommentBadgeText(count: number): string {
  return count > COMMENT_BADGE_MAX_EXACT_COUNT ? `${COMMENT_BADGE_MAX_EXACT_COUNT}+` : String(count);
}

function createNodeCommentBadge(
  constructors: PixiConstructors,
  node: Node,
  count: number | undefined,
): { circle: Graphics; text: Text } | null {
  if (count === undefined || count <= 0) return null;
  const cx = node.x;
  const cy = node.y + node.height;
  const circle = new constructors.Graphics();
  circle.circle(cx, cy, COMMENT_BADGE_RADIUS).fill({ color: COMMENT_BADGE_COLOR });
  const text = new constructors.Text({
    text: formatCommentBadgeText(count),
    style: { fontSize: COMMENT_BADGE_FONT_SIZE, fill: COMMENT_BADGE_TEXT_COLOR },
  });
  text.anchor.set(0.5);
  text.x = cx;
  text.y = cy;
  return { circle, text };
}

function createNodeLabelText(
  constructors: PixiConstructors,
  node: Node,
  learnDisplay: LearnLabelDisplayContext,
): Text {
  const { text, realLabelForWidth } = resolveLearnLabelDisplay(node, learnDisplay);
  const presentation = resolveLabelTextPresentation(node);
  const contentWidth = node.width - NODE_LABEL_HORIZONTAL_PADDING;
  const maxContentHeight = nodeLabelContentHeightBudget(node);
  const ellipsizeInput = {
    fontSize: presentation.fontSize,
    contentWidth,
    maxContentHeight,
  };
  // 表示文字列は Node に保存せず都度導出。domain wrap を正本とし Pixi wordWrap は使わない
  const { text: displayText } = ellipsizeWrappedLabel({ text, ...ellipsizeInput });
  const style = {
    fontSize: presentation.fontSize,
    fontWeight: presentation.fontWeight,
    fill: NODE_LABEL_FILL,
    wordWrap: false,
    wordWrapWidth: contentWidth,
    align: "center" as const,
  };
  const labelText = new constructors.Text({ text: displayText, style });
  if (text !== realLabelForWidth) {
    const { text: measureDisplay } = ellipsizeWrappedLabel({
      text: realLabelForWidth,
      ...ellipsizeInput,
    });
    const measureText = new constructors.Text({
      text: measureDisplay,
      style,
    });
    labelText.width = measureText.width;
  }
  labelText.anchor.set(0.5);
  labelText.x = node.x + node.width / 2;
  labelText.y = node.y + getNodeLabelCenterOffset(node);
  return labelText;
}

function createNodeKindBar(constructors: PixiConstructors, node: Node): Graphics | null {
  if (node.kind === undefined) return null;
  const bar = new constructors.Graphics();
  // glow なし（fill のみ）
  bar.rect(node.x, node.y, NODE_KIND_BAR_WIDTH_PX, node.height)
    .fill({ color: nodeKindBarPixiColor(node.kind) });
  return bar;
}

function createNodeIconText(
  constructors: PixiConstructors,
  node: Node,
  labelText: Text,
): Text | null {
  if (node.icon === undefined) return null;
  const icon = new constructors.Text({
    text: node.icon,
    style: {
      fontSize: NODE_ICON_DISPLAY_SIZE_PX,
      fill: NODE_LABEL_FILL,
    },
  });
  icon.anchor.set(0.5);
  icon.x = getNodeIconCenterX(labelText.x, labelText.width);
  icon.y = labelText.y;
  return icon;
}

function createNodeLabelUnderline(
  constructors: PixiConstructors,
  node: Node,
  text: Text,
): Graphics | null {
  if (!resolveLabelUnderline(node)) return null;
  const underline = new constructors.Graphics();
  const y = text.y + text.height / 2 + NODE_LABEL_UNDERLINE_GAP;
  underline
    .moveTo(text.x - text.width / 2, y)
    .lineTo(text.x + text.width / 2, y)
    .stroke({ width: NODE_LABEL_UNDERLINE_STROKE_WIDTH, color: NODE_LABEL_FILL });
  return underline;
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
    const isLocked = node.locked === true;
    // Container の alpha は表示のフェードが使うので、子要素の alpha で半透明にする
    const contentAlpha = resolveNodeContentAlpha(node.id, options);
    const container = new constructors.Container();
    container.alpha = isVisible ? 1 : 0;
    container.visible = isVisible;
    container.eventMode = isVisible ? "static" : "none";
    container.cursor = isVisible ? "pointer" : "default";
    container.hitArea = createNodeHitArea(node);
    container.on("pointerdown", (event: FederatedPointerEvent) => {
      options.onNodePointerDown(node.id, event);
    });

    const shape = createNodeShape(constructors, node, { isSelected, isConnectionTarget, isLocked });
    shape.alpha = contentAlpha;
    container.addChild(shape);

    const kindBar = createNodeKindBar(constructors, node);
    if (kindBar !== null) {
      kindBar.alpha = contentAlpha;
      container.addChild(kindBar);
    }

    const sprite = createNodeIllustrationSprite(constructors, node, options.illustrationTextures);
    if (sprite !== null) {
      sprite.alpha = contentAlpha;
      container.addChild(sprite);
    }

    if (!isEditing) {
      const text = createNodeLabelText(constructors, node, options.learnDisplay);
      text.alpha = contentAlpha;
      const icon = createNodeIconText(constructors, node, text);
      if (icon !== null) {
        icon.alpha = contentAlpha;

      }
      const underline = createNodeLabelUnderline(constructors, node, text);
      if (underline !== null) {
        underline.alpha = contentAlpha;

      }
      const progress = isVisible ? options.taskProgress.get(node.id) : undefined;
      const body = resolveTaskProgressMapBody(node);
      if (shouldShowTaskProgressMapBadge(progress, body) && progress) {
        const layout = computeTaskProgressMapLabelLayout(node, {
          textWidth: text.width,
          textHeight: text.height,
          textY: text.y,
          iconWidth: icon?.width,
          iconX: icon?.x,
          iconHeight: icon?.height,
          hasUnderline: underline !== null,
        }, body);
        const upper = new constructors.Container();
        upper.scale.set(layout.upper.scale);
        upper.position.set(layout.upper.x, layout.upper.y);
        upper.addChild(text);
        if (icon) upper.addChild(icon);
        if (underline) upper.addChild(underline);
        container.addChild(upper);

        const badge = new constructors.Text({
          text: formatTaskProgressMapBadgeText(progress),
          style: { fontSize: 10, fill: NODE_LABEL_FILL },
        });
        badge.alpha = contentAlpha;
        badge.anchor.set(0.5);
        badge.x = layout.badge.x;
        badge.y = layout.badge.y;
        if (badge.scale) {
          badge.scale.set(Math.min(1, body.innerWidth / Math.max(1, badge.width)));
        }
        container.addChild(badge);
      } else {
        container.addChild(text);
        if (icon) container.addChild(icon);
        if (underline) container.addChild(underline);
      }
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

    const lockMarker = createNodeLockMarker(constructors, node);
    if (lockMarker !== null) {
      lockMarker.alpha = contentAlpha;
      container.addChild(lockMarker);
    }

    // 件数を読めるよう角印より手前に描く
    const commentBadge = isVisible
      ? createNodeCommentBadge(constructors, node, options.commentNodeCounts.get(node.id))
      : null;
    if (commentBadge !== null) {
      commentBadge.circle.alpha = contentAlpha;
      commentBadge.text.alpha = contentAlpha;
      container.addChild(commentBadge.circle);
      container.addChild(commentBadge.text);
    }

    stage.addChild(container);
    visibilityTargets.set(
      visibilityKey,
      createNodeVisibilityTarget(visibilityKey, container),
    );
  }
  return visibilityTargets;
}
