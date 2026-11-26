import { TOUCH_NODE_HIT_PADDING_PX } from "@/domain/map/touchTabletConstants";
import type { Node } from "@/types/node";
import { getFederatedPointerTypeForHitTest } from "@/components/map/pixi/federatedPointerTypeScope";

export type NodeHitArea = {
  contains: (x: number, y: number) => boolean;
};

export function createNodeHitArea(node: Node): NodeHitArea {
  return {
    contains(x, y) {
      const padding = getFederatedPointerTypeForHitTest() === "touch"
        ? TOUCH_NODE_HIT_PADDING_PX
        : 0;
      return x >= node.x - padding
        && x <= node.x + node.width + padding
        && y >= node.y - padding
        && y <= node.y + node.height + padding;
    },
  };
}