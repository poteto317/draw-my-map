import { fitNodeHeightToLabel } from "@/domain/nodes/nodeLabelLayout";
import {
  toggleNodeLabelBold,
  toggleNodeLabelUnderline,
  updateNodeLabelFontSize,
} from "@/domain/nodes/nodeLabelTextStyleUpdate";
import { createTestNode } from "@/testing/createTestNode";

describe("updateNodeLabelFontSize", () => {
  it("対象ノードのサイズを変え fit し、ほかは参照を保つ", () => {
    const target = createTestNode({ id: 1 });
    const other = createTestNode({ id: 2, labelFontSize: 12 });

    const result = updateNodeLabelFontSize([target, other], 1, 18);

    const expected = fitNodeHeightToLabel({ ...target, labelFontSize: 18 }, "commit");
    expect(result).toEqual([expected, other]);
    expect(result?.[1]).toBe(other);
  });

  it("14 に戻すと labelFontSize キーを削除し fit する", () => {
    const target = createTestNode({ id: 1, labelFontSize: 18, labelBold: true });

    const result = updateNodeLabelFontSize([target], 1, 14);

    expect(result?.[0]).toEqual(
      fitNodeHeightToLabel(createTestNode({ id: 1, labelBold: true }), "commit"),
    );
    expect("labelFontSize" in (result?.[0] ?? {})).toBe(false);
  });

  it("すでに同じ実効サイズなら null", () => {
    const plain = createTestNode({ id: 1 });
    const sized = createTestNode({ id: 2, labelFontSize: 18 });

    expect(updateNodeLabelFontSize([plain], 1, 14)).toBeNull();
    expect(updateNodeLabelFontSize([sized], 2, 18)).toBeNull();
  });

  it("対象不在・locked は null", () => {
    const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2, locked: true })];

    expect(updateNodeLabelFontSize(nodes, 999, 18)).toBeNull();
    expect(updateNodeLabelFontSize(nodes, 2, 18)).toBeNull();
  });
});

describe("toggleNodeLabelBold", () => {
  it("書式だけ変え、fit しない（高さ不変）", () => {
    const tall = createTestNode({
      id: 1,
      label: "短い",
      height: 200,
      labelFontSize: 18,
    });
    const result = toggleNodeLabelBold([tall], 1);
    expect(result?.[0]?.height).toBe(200);
    expect(result?.[0]?.labelBold).toBe(true);
  });

  it("未設定なら true を付け、true ならキー削除する", () => {
    const plain = createTestNode({ id: 1, labelFontSize: 18 });
    const bold = createTestNode({ id: 2, labelBold: true, labelUnderline: true });

    expect(toggleNodeLabelBold([plain], 1)).toEqual([
      { ...plain, labelBold: true },
    ]);
    expect(toggleNodeLabelBold([bold], 2)?.[0]).toEqual(
      createTestNode({ id: 2, labelUnderline: true }),
    );
    expect("labelBold" in (toggleNodeLabelBold([bold], 2)?.[0] ?? {})).toBe(false);
  });

  it("対象不在・locked は null", () => {
    const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2, locked: true })];

    expect(toggleNodeLabelBold(nodes, 999)).toBeNull();
    expect(toggleNodeLabelBold(nodes, 2)).toBeNull();
  });
});

describe("toggleNodeLabelUnderline", () => {
  it("未設定なら true を付け、true ならキー削除する", () => {
    const plain = createTestNode({ id: 1 });
    const underlined = createTestNode({ id: 2, labelUnderline: true, labelBold: true });

    expect(toggleNodeLabelUnderline([plain], 1)).toEqual([
      { ...plain, labelUnderline: true },
    ]);
    expect(toggleNodeLabelUnderline([underlined], 2)?.[0]).toEqual(
      createTestNode({ id: 2, labelBold: true }),
    );
  });

  it("対象不在・locked は null", () => {
    const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2, locked: true })];

    expect(toggleNodeLabelUnderline(nodes, 999)).toBeNull();
    expect(toggleNodeLabelUnderline(nodes, 2)).toBeNull();
  });
});
