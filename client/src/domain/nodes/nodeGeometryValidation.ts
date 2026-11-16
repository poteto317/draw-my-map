import type { Node } from "@/types/node";

// 座標が有限でない・幅高が 0 以下のノードがあるか。配置不能（placement-failed）と構造不正（invalid-structure）を
// 分類するため、森の検証（indexNodeForest）より先に呼ぶ
export function hasInvalidNodeGeometry(nodes: readonly Node[]): boolean {
  return nodes.some((node) => (
    !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
    !Number.isFinite(node.width) || !Number.isFinite(node.height) ||
    node.width <= 0 || node.height <= 0
  ));
}
