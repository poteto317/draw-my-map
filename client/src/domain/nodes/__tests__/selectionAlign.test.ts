import { alignSelection } from "@/domain/nodes/selectionAlign";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, x: number, y: number, width = 100, height = 60) {
  return createTestNode({ id, parentId: null, x, y, width, height, label: `${id}` });
}

describe("alignSelection", () => {
  it("選択が2件未満なら拒否する", () => {
    const nodes = [node(1, 0, 0)];
    expect(alignSelection(nodes, [1], "align-left")).toEqual({
      ok: false,
      reason: "insufficient-selection",
    });
  });

  it("locked を含む選択は拒否する", () => {
    const nodes = [
      node(1, 0, 0),
      { ...node(2, 200, 0), locked: true as const },
    ];
    expect(alignSelection(nodes, [1, 2], "align-left")).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("左揃えは左端を基準に x を合わせる", () => {
    const nodes = [node(1, 40, 10), node(2, 220, 80)];
    const result = alignSelection(nodes, [1, 2], "align-left");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.find((item) => item.id === 1)?.x).toBe(40);
    expect(result.nodes.find((item) => item.id === 2)?.x).toBe(40);
  });

  it.each([
    ["align-center-x", (items: ReturnType<typeof node>[]) => {
      const center = (40 + (220 + 100)) / 2;
      expect(items.find((item) => item.id === 1)?.x).toBe(center - 50);
      expect(items.find((item) => item.id === 2)?.x).toBe(center - 50);
    }],
    ["align-right", (items: ReturnType<typeof node>[]) => {
      expect(items.find((item) => item.id === 1)?.x).toBe(220);
      expect(items.find((item) => item.id === 2)?.x).toBe(220);
    }],
    ["align-top", (items: ReturnType<typeof node>[]) => {
      expect(items.find((item) => item.id === 1)?.y).toBe(10);
      expect(items.find((item) => item.id === 2)?.y).toBe(10);
    }],
    ["align-center-y", (items: ReturnType<typeof node>[]) => {
      const center = (10 + (80 + 60)) / 2;
      expect(items.find((item) => item.id === 1)?.y).toBe(center - 30);
      expect(items.find((item) => item.id === 2)?.y).toBe(center - 30);
    }],
    ["align-bottom", (items: ReturnType<typeof node>[]) => {
      expect(items.find((item) => item.id === 1)?.y).toBe(80);
      expect(items.find((item) => item.id === 2)?.y).toBe(80);
    }],
  ] as const)("6種の整列: %s", (op, assert) => {
    const nodes = [node(1, 40, 10), node(2, 220, 80)];
    const result = alignSelection(nodes, [1, 2], op);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    assert(result.nodes);
  });
});