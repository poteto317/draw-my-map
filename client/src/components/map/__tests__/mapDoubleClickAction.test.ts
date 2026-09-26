import { resolveMapDoubleClickAction } from "@/components/map/mapDoubleClickAction";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

const node: Node = createTestNode({
  id: 1,
  parentId: null,
  x: 70,
  y: 45,
  width: 10,
  height: 10,
  label: "node",
});

const input = {
  client: { x: 300, y: 200 },
  bounds: { left: 100, top: 50 },
  viewport: { offsetX: 50, offsetY: 50, scale: 2 },
};

describe("resolveMapDoubleClickAction", () => {
  it("変換後のワールド座標にあるノードの編集actionを返す", () => {
    expect(resolveMapDoubleClickAction({ ...input, nodes: [node] })).toEqual({
      type: "edit",
      nodeId: 1,
    });
  });

  it("空白では変換後のワールド座標を含む追加actionを返す", () => {
    expect(resolveMapDoubleClickAction({ ...input, nodes: [] })).toEqual({
      type: "add",
      point: { x: 75, y: 50 },
    });
  });

  it.each([
    {
      client: { x: Number.MAX_VALUE, y: 0 },
      viewport: { offsetX: -Number.MAX_VALUE, offsetY: 0, scale: 1 },
    },
    {
      client: { x: -Number.MAX_VALUE, y: 0 },
      viewport: { offsetX: Number.MAX_VALUE, offsetY: 0, scale: 1 },
    },
    {
      client: { x: 0, y: Number.MAX_VALUE },
      viewport: { offsetX: 0, offsetY: -Number.MAX_VALUE, scale: 1 },
    },
    {
      client: { x: Number.NaN, y: 0 },
      viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    },
  ])("変換後のワールド座標が非有限ならactionを返さない", ({
    client,
    viewport,
  }) => {
    expect(resolveMapDoubleClickAction({
      client,
      bounds: { left: 0, top: 0 },
      viewport,
      nodes: [node],
    })).toBeNull();
  });
});
