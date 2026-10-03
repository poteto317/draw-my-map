import {
  ILLUSTRATED_NODE_HEIGHT,
  ILLUSTRATION_AREA_HEIGHT,
  ILLUSTRATION_SIZE,
  ILLUSTRATION_TOP_PADDING,
} from "@/config/shapes";
import type { Node } from "@/types/node";

export function getNodeIllustrationRect(node: Pick<Node, "x" | "y" | "width">) {
  return {
    x: node.x + (node.width - ILLUSTRATION_SIZE) / 2,
    y: node.y + ILLUSTRATION_TOP_PADDING,
    size: ILLUSTRATION_SIZE,
  };
}

// ノード上端から、テキストの中心までの距離。イラストがあるときは、その下の領域の中央にする。
// 「height / 2」の形を保つのは、イラストが無いノードの描画・エクスポートの計算結果（浮動小数点）を変えないため。
export function getNodeLabelCenterOffset(node: Pick<Node, "height" | "illustration">): number {
  return node.height / 2 + (node.illustration === undefined ? 0 : ILLUSTRATION_AREA_HEIGHT / 2);
}

// イラストがあるノードは、イラストの領域を含められる高さにする
export function getIllustratedNodeMinHeight(height: number): number {
  return Math.max(height, ILLUSTRATED_NODE_HEIGHT);
}
