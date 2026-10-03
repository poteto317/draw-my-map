import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import { nodeVisibilityKey } from "@/components/map/pixi/mapVisibilityKeys";
import { createNodeVisibilityTarget } from "@/components/map/pixi/pixiVisibilityTarget";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { getNodeIllustrationRect, getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";
import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent, Texture } from "pixi.js";

export type RenderMapNodesOptions = {
  nodes: readonly Node[];
  selectedNodeId: number | null;
  editingNodeId: number | null;
  connectionTargetNodeId: number | null;
  onNodePointerDown: (nodeId: number, event: FederatedPointerEvent) => void;
  visibleKeys?: ReadonlySet<string>;
  // キーは data URL
  illustrationTextures?: ReadonlyMap<string, Texture>;
};

export function renderMapNodes(
  stage: Container,
  constructors: PixiConstructors,
  options: RenderMapNodesOptions,
): Map<string, MapVisibilityTarget> {
  const visibilityTargets = new Map<string, MapVisibilityTarget>();
  for (const node of options.nodes) {
    const visibilityKey = nodeVisibilityKey(node.id);
    const isVisible = options.visibleKeys?.has(visibilityKey) ?? true;
    const isEditing = node.id === options.editingNodeId;
    const isSelected = node.id === options.selectedNodeId;
    const isConnectionTarget = node.id === options.connectionTargetNodeId;
    const container = new constructors.Container();
    container.alpha = isVisible ? 1 : 0;
    container.visible = isVisible;
    container.eventMode = isVisible ? "static" : "none";
    container.cursor = isVisible ? "pointer" : "default";
    container.on("pointerdown", (event: FederatedPointerEvent) => {
      options.onNodePointerDown(node.id, event);
    });

    const graphics = new constructors.Graphics();
    graphics.rect(node.x, node.y, node.width, node.height)
      .fill({ color: isConnectionTarget ? 0xecfdf5 : isSelected ? 0xeff6ff : 0xffffff })
      .stroke({
        width: isConnectionTarget || isSelected ? 3 : 2,
        color: isConnectionTarget ? 0x10b981 : isSelected ? 0x2563eb : 0x3b82f6,
      });
    container.addChild(graphics);

    const illustrationTexture = node.illustration === undefined
      ? undefined
      : options.illustrationTextures?.get(node.illustration);
    if (illustrationTexture !== undefined) {
      const rect = getNodeIllustrationRect(node);
      const sprite = new constructors.Sprite(illustrationTexture);
      sprite.x = rect.x;
      sprite.y = rect.y;
      sprite.width = rect.size;
      sprite.height = rect.size;
      container.addChild(sprite);
    }

    if (!isEditing) {
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
      container.addChild(text);
    }

    stage.addChild(container);
    visibilityTargets.set(
      visibilityKey,
      createNodeVisibilityTarget(visibilityKey, container),
    );
  }
  return visibilityTargets;
}
