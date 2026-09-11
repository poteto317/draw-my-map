import { worldToScreen, type Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

export type NodeLabelEditorLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  lineHeight: string;
  fontSize: number;
};

export function getNodeLabelEditorLayout(
  node: Node,
  viewport: Viewport,
): NodeLabelEditorLayout {
  const position = worldToScreen({ x: node.x, y: node.y }, viewport);
  const width = node.width * viewport.scale;
  const height = node.height * viewport.scale;
  return {
    left: position.x,
    top: position.y,
    width,
    height,
    lineHeight: `${height}px`,
    fontSize: 14 * viewport.scale,
  };
}
