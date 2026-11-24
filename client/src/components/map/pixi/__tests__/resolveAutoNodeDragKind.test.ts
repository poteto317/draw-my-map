import { resolveAutoNodeDragKind } from "@/components/map/pixi/resolveAutoNodeDragKind";
import { createTestNode } from "@/testing/createTestNode";

describe("resolveAutoNodeDragKind", () => {
  it("非ピンは sibling-reorder", () => {
    const node = createTestNode({ id: 1, label: "a" });
    expect(resolveAutoNodeDragKind(node, true)).toEqual({ kind: "sibling-reorder" });
    expect(resolveAutoNodeDragKind(node, false)).toEqual({ kind: "sibling-reorder" });
  });

  it("ピン＋コールバックありは pinned-move", () => {
    const pinned = createTestNode({ id: 1, label: "p", layoutPinned: true });
    expect(resolveAutoNodeDragKind(pinned, true)).toEqual({ kind: "pinned-move" });
  });

  it("ピン＋コールバック欠落は noop（並べ替えへ落とさない）", () => {
    const pinned = createTestNode({ id: 1, label: "p", layoutPinned: true });
    expect(resolveAutoNodeDragKind(pinned, false)).toEqual({ kind: "noop" });
  });

  it("対象不明は sibling-reorder", () => {
    expect(resolveAutoNodeDragKind(undefined, true)).toEqual({ kind: "sibling-reorder" });
  });
});
