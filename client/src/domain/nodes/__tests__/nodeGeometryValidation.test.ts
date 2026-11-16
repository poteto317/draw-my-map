import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

describe("hasInvalidNodeGeometry", () => {
  it("座標が有限で幅高が正のノードだけなら偽（空の配列も偽）", () => {
    expect(hasInvalidNodeGeometry([createTestNode({ id: 1 }), createTestNode({ id: 2, x: -50, y: 1e6 })])).toBe(false);
    expect(hasInvalidNodeGeometry([])).toBe(false);
  });

  it.each<[string, Partial<Node>]>([
    ["x が NaN", { x: Number.NaN }],
    ["y が Infinity", { y: Number.POSITIVE_INFINITY }],
    ["width が -Infinity", { width: Number.NEGATIVE_INFINITY }],
    ["height が NaN", { height: Number.NaN }],
    ["width が 0", { width: 0 }],
    ["height が負", { height: -1 }],
  ])("1 件でも %s なら真", (_name, overrides) => {
    expect(hasInvalidNodeGeometry([createTestNode({ id: 1 }), createTestNode({ id: 2, ...overrides })])).toBe(true);
  });
});
