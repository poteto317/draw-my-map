import { createTestNode } from "@/testing/createTestNode";
import { createNodeHitArea } from "@/components/map/pixi/nodeHitArea";
import {
  getFederatedPointerTypeForHitTest,
  resetFederatedPointerTypeForHitTest,
  setFederatedPointerTypeForHitTest,
} from "@/components/map/pixi/federatedPointerTypeScope";
import { TOUCH_NODE_HIT_PADDING_PX } from "@/domain/map/touchTabletConstants";

const node = createTestNode({ id: 1, x: 100, y: 50, width: 80, height: 40 });

describe("createNodeHitArea", () => {
  afterEach(() => {
    resetFederatedPointerTypeForHitTest();
  });

  it("touch 時だけ contains がパディング拡大する", () => {
    const hitArea = createNodeHitArea(node);
    setFederatedPointerTypeForHitTest("touch");
    expect(hitArea.contains(node.x - TOUCH_NODE_HIT_PADDING_PX, node.y)).toBe(true);
    setFederatedPointerTypeForHitTest("mouse");
    expect(hitArea.contains(node.x - TOUCH_NODE_HIT_PADDING_PX, node.y)).toBe(false);
    expect(hitArea.contains(node.x - 1, node.y)).toBe(false);
  });

  it("初期状態は mouse と同じ", () => {
    expect(getFederatedPointerTypeForHitTest()).toBe("mouse");
  });
});