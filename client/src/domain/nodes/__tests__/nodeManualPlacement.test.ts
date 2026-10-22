import {
  calculateChildPlacement,
  calculateManualOffsetY,
} from "@/domain/nodes/nodeManualPlacement";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

describe("calculateManualOffsetY", () => {
  it("空のマップでは移動しない", () => {
    const sources = [createTestNode({ id: 1, y: 40 })];
    expect(calculateManualOffsetY([], sources)).toBe(0);
  });

  it("マップ全体の下端から40空けた位置へsourcesの上端を移す量を返す", () => {
    const current = [
      createTestNode({ id: 1, y: 140, height: 60 }),
      createTestNode({ id: 2, y: 0, height: 60 }),
    ];
    const sources = [
      createTestNode({ id: 10, y: 40 }),
      createTestNode({ id: 11, y: 80 }),
    ];
    expect(calculateManualOffsetY(current, sources)).toBe(200);
  });

  it("下端がNumber.MAX_VALUE付近で間隔を確保できない場合はnullを返す", () => {
    const current = [createTestNode({ id: 1, y: Number.MAX_VALUE, height: 60 })];
    const sources = [createTestNode({ id: 10, y: 0 })];
    expect(calculateManualOffsetY(current, sources)).toBeNull();
  });

  it("既存のマップでsourcesが空の場合はnullを返す", () => {
    const current = [createTestNode({ id: 1, y: 0, height: 60 })];
    expect(calculateManualOffsetY(current, [])).toBeNull();
  });
});

describe("calculateChildPlacement", () => {
  const parent = createTestNode({ id: 1, parentId: null, x: 100, y: 50, width: 100 });

  it("子が無い親では、親の右へ120空けて親と同じ高さに置く", () => {
    expect(calculateChildPlacement([parent], parent.id)).toEqual({ x: 320, y: 50 });
  });

  it("既存の子があれば、子の下端の最大値から40空けた位置に置く", () => {
    const nodes = [
      parent,
      createTestNode({ id: 2, parentId: 1, x: 320, y: 170, height: 60 }),
      createTestNode({ id: 3, parentId: 1, x: 320, y: 110, height: 60 }),
    ];
    expect(calculateChildPlacement(nodes, parent.id)).toEqual({ x: 320, y: 270 });
  });

  it("親が無い場合はnullを返す", () => {
    expect(calculateChildPlacement([parent], 99)).toBeNull();
  });

  it("別の親の子を数えず、それぞれの親の子だけを見る", () => {
    const otherParent = createTestNode({ id: 5, parentId: null, x: 100, y: 1000, width: 100 });
    const nodes = [
      parent,
      otherParent,
      createTestNode({ id: 2, parentId: 1, x: 320, y: 50, height: 60 }),
      createTestNode({ id: 6, parentId: 5, x: 320, y: 1000, height: 60 }),
      createTestNode({ id: 7, parentId: 5, x: 320, y: 1100, height: 60 }),
    ];
    expect(calculateChildPlacement(nodes, parent.id)).toEqual({ x: 320, y: 150 });
    expect(calculateChildPlacement(nodes, otherParent.id)).toEqual({ x: 320, y: 1200 });
  });

  it("子が500,000件の親でも例外を出さずに位置を返す", () => {
    const count = 500_000;
    const nodes: Node[] = [parent];
    for (let index = 0; index < count; index += 1) {
      nodes.push(createTestNode({ id: index + 2, parentId: 1, x: 320, y: index * 100, height: 60 }));
    }
    expect(calculateChildPlacement(nodes, parent.id)).toEqual({
      x: 320,
      y: (count - 1) * 100 + 60 + 40,
    });
  });
});
