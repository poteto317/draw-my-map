import { resolveNodeContextMenuTarget } from "@/components/map/nodeContextMenuTarget";
import { createTestNode } from "@/testing/createTestNode";

const node = createTestNode({ id: 1, x: 70, y: 45, width: 10, height: 10 });
const input = {
  client: { x: 300, y: 200 },
  bounds: { left: 100, top: 50 },
  viewport: { offsetX: 50, offsetY: 50, scale: 2 },
};

describe("resolveNodeContextMenuTarget", () => {
  it("ワールド座標にノードがあればIDとコンテナ相対anchorを返す", () => {
    expect(resolveNodeContextMenuTarget({ ...input, nodes: [node] })).toEqual({
      nodeId: 1,
      anchor: { x: 200, y: 150 },
    });
  });

  it("ノードがなければnullを返す", () => {
    expect(resolveNodeContextMenuTarget({ ...input, nodes: [] })).toBeNull();
  });

  it("変換後座標が非有限ならnullを返す", () => {
    expect(resolveNodeContextMenuTarget({
      ...input,
      client: { x: Number.MAX_VALUE, y: 0 },
      bounds: { left: -Number.MAX_VALUE, top: 0 },
      nodes: [node],
    })).toBeNull();
  });
});
