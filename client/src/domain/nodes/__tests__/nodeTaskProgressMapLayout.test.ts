import {
  computeTaskProgressMapLabelLayout,
  formatTaskProgressMapBadgeText,
  resolveTaskProgressMapBody,
  shouldShowTaskProgressMapBadge,
} from "@/domain/nodes/nodeTaskProgressMapLayout";
import { createTestNode } from "@/testing/createTestNode";

describe("nodeTaskProgressMapLayout", () => {
  const progress = { percent: 33, remaining: 2 };

  it("バッジ文言を整形する", () => {
    expect(formatTaskProgressMapBadgeText(progress)).toBe("33% 残2");
  });

  it("帯が小さすぎるときはバッジを出さない", () => {
    const node = createTestNode({ width: 30, height: 20, y: 0 });
    const body = resolveTaskProgressMapBody(node);
    expect(shouldShowTaskProgressMapBadge(progress, body)).toBe(false);
  });

  it("十分なボディで縮小レイアウトを計算する", () => {
    const node = createTestNode({ x: 50, y: 30, width: 100, height: 60 });
    const body = resolveTaskProgressMapBody(node);
    expect(shouldShowTaskProgressMapBadge(progress, body)).toBe(true);
    const layout = computeTaskProgressMapLabelLayout(node, {
      textWidth: 80,
      textHeight: 18,
      textY: 60,
      hasUnderline: false,
    }, body);
    expect(layout.upper.scale).toBeLessThanOrEqual(1);
    expect(layout.badge.x).toBe(100);
  });
});