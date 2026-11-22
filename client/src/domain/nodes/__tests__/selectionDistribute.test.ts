import { distributeSelection } from "@/domain/nodes/selectionDistribute";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, x: number, y: number) {
  return createTestNode({ id, parentId: null, x, y, width: 100, height: 60, label: `${id}` });
}

describe("distributeSelection", () => {
  it("2件選択では移動しない", () => {
    const nodes = [node(1, 0, 0), node(2, 200, 0)];
    const result = distributeSelection(nodes, [1, 2], "x");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes).toEqual(nodes);
  });

  it("locked を含む選択は拒否する", () => {
    const nodes = [
      node(1, 0, 0),
      node(2, 200, 0),
      { ...node(3, 500, 0), locked: true as const },
    ];
    expect(distributeSelection(nodes, [1, 2, 3], "x")).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("水平等間隔で中間ノードの隙間を揃える", () => {
    const nodes = [node(1, 0, 0), node(2, 200, 0), node(3, 500, 0)];
    const result = distributeSelection(nodes, [1, 2, 3], "x");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.nodes.find((item) => item.id === 1)?.x).toBe(0);
    expect(result.nodes.find((item) => item.id === 3)?.x).toBe(500);
    expect(result.nodes.find((item) => item.id === 2)?.x).toBe(250);
  });

  it("垂直等間隔で中間ノードの隙間を揃える", () => {
    const nodes = [node(1, 0, 0), node(2, 0, 200), node(3, 0, 500)];
    const result = distributeSelection(nodes, [1, 2, 3], "y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.nodes.find((item) => item.id === 1)?.y).toBe(0);
    expect(result.nodes.find((item) => item.id === 3)?.y).toBe(500);
    expect(result.nodes.find((item) => item.id === 2)?.y).toBe(250);
  });
});