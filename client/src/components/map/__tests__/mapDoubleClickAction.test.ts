import { resolveMapDoubleClickAction } from "@/components/map/mapDoubleClickAction";
import type { Node } from "@/types/node";

const node: Node = {
  id: 1,
  parentId: null,
  x: 70,
  y: 45,
  width: 10,
  height: 10,
  label: "node",
};

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
});
