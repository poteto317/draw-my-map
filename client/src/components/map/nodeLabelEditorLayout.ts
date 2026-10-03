import { worldToScreen, type Viewport } from "@/components/map/mapViewport";
import { getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";
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
  // 入力欄の中心を、テキストの中心（getNodeLabelCenterOffset）に合わせる。
  // イラストがあるノードでは、イラストの下の領域だけを入力欄にする。
  const topInset = getNodeLabelCenterOffset(node) * 2 - node.height;
  const position = worldToScreen({ x: node.x, y: node.y + topInset }, viewport);
  const width = node.width * viewport.scale;
  const height = (node.height - topInset) * viewport.scale;
  return {
    left: position.x,
    top: position.y,
    width,
    height,
    lineHeight: `${height}px`,
    fontSize: 14 * viewport.scale,
  };
}
