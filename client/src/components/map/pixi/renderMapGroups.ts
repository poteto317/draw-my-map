import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import {
  GROUP_FRAME_CORNER_RADIUS_PX,
  groupDisplayLabel,
  listDrawableMapGroups,
} from "@/domain/map/mapGroupGeometry";
import type { MapGroup } from "@/types/mapGroup";
import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent, Graphics } from "pixi.js";

const GROUP_FILL_COLOR = 0x94a3b8;
const GROUP_FILL_ALPHA = 0.14;
const GROUP_STROKE_COLOR = 0x64748b;
const GROUP_STROKE_SELECTED = 0x2563eb;
const GROUP_LABEL_FILL = 0x475569;
const GROUP_LABEL_FONT_SIZE = 12;
const GROUP_LABEL_TOP_INSET = 4;

export type RenderMapGroupsOptions = {
  groups: readonly MapGroup[] | undefined;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  selectedGroupId: number | null;
  onGroupPointerDown: (groupId: number, event: FederatedPointerEvent) => void;
};

function drawGroupFrame(
  graphics: Graphics,
  aabb: { x: number; y: number; width: number; height: number },
  selected: boolean,
): void {
  const strokeWidth = selected ? 2.5 : 1.5;
  const strokeColor = selected ? GROUP_STROKE_SELECTED : GROUP_STROKE_COLOR;
  graphics
    .roundRect(aabb.x, aabb.y, aabb.width, aabb.height, GROUP_FRAME_CORNER_RADIUS_PX)
    .fill({ color: GROUP_FILL_COLOR, alpha: GROUP_FILL_ALPHA })
    .stroke({ width: strokeWidth, color: strokeColor });
}

/** 背面レイヤ。メンバー AABB＋余白の角丸。ヒット有効。空ラベルは「グループ」表示のみ */
export function renderMapGroups(
  stage: Container,
  constructors: Pick<PixiConstructors, "Graphics" | "Text" | "Container">,
  options: RenderMapGroupsOptions,
): void {
  const {
    groups,
    nodes,
    visibleNodeIds,
    selectedGroupId,
    onGroupPointerDown,
  } = options;
  // 面積降順は listDrawableMapGroups（大きい枠を先＝背面、小さい枠がヒット優先）
  const drawable = listDrawableMapGroups(groups, nodes, visibleNodeIds);

  for (const { group, aabb } of drawable) {
    const selected = selectedGroupId === group.id;
    const container = new constructors.Container();
    const graphics = new constructors.Graphics();
    graphics.eventMode = "static";
    graphics.cursor = "pointer";
    drawGroupFrame(graphics, aabb, selected);
    graphics.on("pointerdown", (event: FederatedPointerEvent) => {
      event.stopPropagation();
      onGroupPointerDown(group.id, event);
    });

    const label = new constructors.Text({
      text: groupDisplayLabel(group.label),
      style: {
        fontSize: GROUP_LABEL_FONT_SIZE,
        fill: GROUP_LABEL_FILL,
      },
    });
    label.eventMode = "none";
    label.anchor.set(0.5, 0);
    label.x = aabb.x + aabb.width / 2;
    label.y = aabb.y + GROUP_LABEL_TOP_INSET;

    container.addChild(graphics);
    container.addChild(label);
    stage.addChild(container);
  }
}
