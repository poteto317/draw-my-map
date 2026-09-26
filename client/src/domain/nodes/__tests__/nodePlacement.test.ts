import {
  createChildNode,
  createRootNode,
  createSiblingNode,
} from "@/domain/nodes/nodePlacement";
import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import type { Node } from "@/types/node";

const parent: Node = {
  id: 1,
  parentId: null,
  x: 80,
  y: 100,
  width: RECT_WIDTH,
  height: RECT_HEIGHT,
  label: "parent",
  importance: "medium" as const,
};

describe("node placement", () => {
  it("centers a root node at the requested coordinates", () => {
    expect(createRootNode(10, 200, 150)).toEqual({
      id: 10,
      parentId: null,
      x: 200 - RECT_WIDTH / 2,
      y: 150 - RECT_HEIGHT / 2,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label: "",
      importance: "medium" as const,
    });
  });

  it("places the first child aligned with its parent", () => {
    expect(createChildNode([parent], parent.id, 2)).toMatchObject({
      id: 2,
      parentId: parent.id,
      x: parent.x + parent.width + 120,
      y: parent.y,
      importance: "medium" as const,
    });
  });

  it("places a later child below the lowest existing child regardless of array order", () => {
    const children: Node[] = [
      { ...parent, id: 3, parentId: parent.id, y: 310 },
      { ...parent, id: 2, parentId: parent.id, y: 170 },
    ];

    expect(createChildNode([parent, ...children], parent.id, 4)).toMatchObject({
      id: 4,
      parentId: parent.id,
      y: 310 + RECT_HEIGHT + 40,
      importance: "medium" as const,
    });
  });

  it("returns null when the parent is missing", () => {
    expect(createChildNode([parent], 999, 2)).toBeNull();
  });

  it("places a sibling below the lowest sibling and preserves parent and x", () => {
    const siblings: Node[] = [
      { ...parent, id: 3, y: 310 },
      { ...parent, id: 2, y: 170 },
    ];

    expect(createSiblingNode(siblings, 2, 4)).toEqual({
      id: 4,
      parentId: null,
      x: parent.x,
      y: 310 + RECT_HEIGHT + 40,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label: "",
      importance: "medium" as const,
    });
  });

  it("creates a sibling for a root node with a null parent", () => {
    expect(createSiblingNode([parent], parent.id, 2)).toMatchObject({
      id: 2,
      parentId: null,
      x: parent.x,
      y: parent.y + RECT_HEIGHT + 40,
      importance: "medium" as const,
    });
  });

  it("returns null when the sibling source is missing", () => {
    expect(createSiblingNode([parent], 999, 2)).toBeNull();
  });

  it("uses fixed dimensions and an empty initial label for every placement", () => {
    expect(createRootNode(10, 0, 0)).toMatchObject({
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label: "",
      importance: "medium" as const,
    });
    expect(createChildNode([parent], parent.id, 2)).toMatchObject({
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label: "",
      importance: "medium" as const,
    });
  });
});
