import type { Node } from "@/types/node";
import {
  findNodeAtPoint,
  getEdgeCurve,
  toLocalPoint,
} from "@/components/map/mapGeometry";

const target: Node = {
  id: 1,
  parentId: null,
  x: 100,
  y: 50,
  width: 80,
  height: 40,
  label: "target",
};

describe("map geometry", () => {
  it("converts client coordinates to local coordinates", () => {
    expect(toLocalPoint(310, 220, { left: 100, top: 50 })).toEqual({ x: 210, y: 170 });
  });

  it("finds a node when the point is on any inclusive rectangle boundary", () => {
    expect(findNodeAtPoint([target], { x: target.x, y: target.y })).toBe(target);
    expect(findNodeAtPoint([target], {
      x: target.x + target.width,
      y: target.y,
    })).toBe(target);
    expect(findNodeAtPoint([target], {
      x: target.x,
      y: target.y + target.height,
    })).toBe(target);
    expect(findNodeAtPoint([target], {
      x: target.x + target.width,
      y: target.y + target.height,
    })).toBe(target);
  });

  it("returns undefined outside the node rectangle", () => {
    expect(findNodeAtPoint([target], { x: target.x - 1, y: target.y })).toBeUndefined();
    expect(findNodeAtPoint([target], { x: target.x, y: target.y - 1 })).toBeUndefined();
    expect(findNodeAtPoint([target], {
      x: target.x + target.width + 1,
      y: target.y,
    })).toBeUndefined();
    expect(findNodeAtPoint([target], {
      x: target.x,
      y: target.y + target.height + 1,
    })).toBeUndefined();
  });

  it("returns the last matching node because later nodes render in front", () => {
    const overlapping = { ...target, id: 2 };
    expect(findNodeAtPoint([target, overlapping], { x: target.x + 1, y: target.y + 1 })).toBe(overlapping);
  });

  it("builds a bezier edge from parent right-center to child left-center", () => {
    const parent = { ...target, x: 50, y: 30, width: 100, height: 60 };
    const child = { ...target, id: 2, x: 270, y: 100, width: 40, height: 40 };

    expect(getEdgeCurve(parent, child)).toEqual({
      start: { x: 150, y: 60 },
      control1: { x: 210, y: 60 },
      control2: { x: 210, y: 120 },
      end: { x: 270, y: 120 },
    });
  });
});
