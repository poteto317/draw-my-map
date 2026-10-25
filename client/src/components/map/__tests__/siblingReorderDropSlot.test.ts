import { resolveSiblingReorderDrop } from "@/components/map/siblingReorderDropSlot";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

// 親 R（1）の子 A（2）・T（3）・B（4）・C（5）。x 220・幅 100・高さ 60・y 0, 100, 200, 300
function createSiblings(): Node[] {
  return [
    createTestNode({ id: 1, parentId: null, x: 0, y: 150, label: "R" }),
    createTestNode({ id: 2, parentId: 1, x: 220, y: 0, label: "A" }),
    createTestNode({ id: 3, parentId: 1, x: 220, y: 100, label: "T" }),
    createTestNode({ id: 4, parentId: 1, x: 220, y: 200, label: "B" }),
    createTestNode({ id: 5, parentId: 1, x: 220, y: 300, label: "C" }),
  ];
}

function allVisible(nodes: readonly Node[]): ReadonlySet<number> {
  return new Set(nodes.map((node) => node.id));
}

describe("resolveSiblingReorderDrop", () => {
  const nodes = createSiblings();
  const visible = allVisible(nodes);

  it("先頭の兄弟の中心より上では A の前へ入れ、線は A の 20px 上", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 3, 10)).toEqual({
      slot: 0,
      target: { position: "before", anchorId: 2 },
      indicator: { left: 212, right: 328, y: -20 },
    });
  });

  it("元の位置では target も線も null", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 3, 150)).toEqual({
      slot: 1,
      target: null,
      indicator: null,
    });
  });

  it("B と C の間では B の後ろへ入れ、線は B の下端と C の上端の中点", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 3, 250)).toEqual({
      slot: 2,
      target: { position: "after", anchorId: 4 },
      indicator: { left: 212, right: 328, y: 280 },
    });
  });

  it("末尾の兄弟より下では C の後ろへ入れ、線は C の 20px 下", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 3, 400)).toEqual({
      slot: 3,
      target: { position: "after", anchorId: 5 },
      indicator: { left: 212, right: 328, y: 380 },
    });
  });

  it("兄弟の中心ちょうどはその兄弟より下として数える", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 3, 230)).toEqual({
      slot: 2,
      target: { position: "after", anchorId: 4 },
      indicator: { left: 212, right: 328, y: 280 },
    });
  });

  it("T が先頭のとき、先頭より上は元の位置で、B と C の間は B の後ろ", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 2, 10)).toEqual({
      slot: 0,
      target: null,
      indicator: null,
    });
    expect(resolveSiblingReorderDrop(nodes, visible, 2, 250)).toEqual({
      slot: 2,
      target: { position: "after", anchorId: 4 },
      indicator: { left: 212, right: 328, y: 280 },
    });
  });

  it("T が末尾のとき、末尾より下は元の位置で、先頭より上は A の前", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 5, 400)).toEqual({
      slot: 3,
      target: null,
      indicator: null,
    });
    expect(resolveSiblingReorderDrop(nodes, visible, 5, 10)).toEqual({
      slot: 0,
      target: { position: "before", anchorId: 2 },
      indicator: { left: 212, right: 328, y: -20 },
    });
  });

  it("一人っ子はどこでも元の位置", () => {
    const onlyChild = [
      createTestNode({ id: 1, parentId: null, x: 0, y: 0 }),
      createTestNode({ id: 3, parentId: 1, x: 220, y: 0 }),
    ];
    const onlyChildVisible = allVisible(onlyChild);

    for (const pointerY of [-100, 30, 500]) {
      expect(resolveSiblingReorderDrop(onlyChild, onlyChildVisible, 3, pointerY)).toEqual({
        slot: 0,
        target: null,
        indicator: null,
      });
    }
  });

  it("隠れた兄弟は挿入位置の候補に入らない", () => {
    const withoutB = new Set([1, 2, 3, 5]);

    expect(resolveSiblingReorderDrop(nodes, withoutB, 3, 250)).toEqual({
      slot: 1,
      target: null,
      indicator: null,
    });
  });

  it("別の親の子は候補に入らず、線の右端にも影響しない", () => {
    const withOtherTree = [
      ...nodes,
      createTestNode({ id: 6, parentId: null, x: 400, y: 180, label: "R2" }),
      createTestNode({ id: 7, parentId: 6, x: 600, y: 180, label: "X" }),
    ];

    expect(resolveSiblingReorderDrop(withOtherTree, allVisible(withOtherTree), 3, 250)).toEqual({
      slot: 2,
      target: { position: "after", anchorId: 4 },
      indicator: { left: 212, right: 328, y: 280 },
    });
  });

  it("渡された表示用の座標で判定する", () => {
    // 正本の座標では B の中心が 230 で slot 2 になるが、表示用の座標では B が 500 にある
    const displayNodes = nodes.map((node) => {
      if (node.id === 4) return { ...node, y: 500 };
      if (node.id === 5) return { ...node, y: 600 };
      return node;
    });

    expect(resolveSiblingReorderDrop(nodes, visible, 3, 250)?.slot).toBe(2);
    expect(resolveSiblingReorderDrop(displayNodes, visible, 3, 250)).toEqual({
      slot: 1,
      target: null,
      indicator: null,
    });
  });

  it("pointerY が有限でなければ null", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 3, Number.NaN)).toBeNull();
    expect(resolveSiblingReorderDrop(nodes, visible, 3, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("T が無いか隠れていれば null", () => {
    expect(resolveSiblingReorderDrop(nodes, visible, 99, 250)).toBeNull();
    expect(resolveSiblingReorderDrop(nodes, new Set([1, 2, 4, 5]), 3, 250)).toBeNull();
  });
});
