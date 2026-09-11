import { createDragActivation } from "@/components/map/pixi/dragActivation";

describe("createDragActivation", () => {
  it("両軸が閾値未満の間は移動を返さない", () => {
    const activation = createDragActivation({ x: 10, y: 20 }, 4);

    expect(activation.update({ x: 13, y: 17 })).toBeNull();
  });

  it.each([
    [{ x: 14, y: 20 }, { x: 4, y: 0 }],
    [{ x: 10, y: 16 }, { x: 0, y: -4 }],
  ])("いずれかの軸が閾値へ達すると開始点からの総差分を返す", (point, expected) => {
    const activation = createDragActivation({ x: 10, y: 20 }, 4);

    expect(activation.update(point)).toEqual(expected);
  });

  it("開始後は閾値内へ戻っても総差分を返す", () => {
    const activation = createDragActivation({ x: 10, y: 20 }, 4);
    activation.update({ x: 14, y: 20 });

    expect(activation.update({ x: 11, y: 21 })).toEqual({ x: 1, y: 1 });
  });

  it("開始座標の後続変更に影響されない", () => {
    const start = { x: 10, y: 20 };
    const activation = createDragActivation(start, 4);
    start.x = 100;

    expect(activation.update({ x: 14, y: 20 })).toEqual({ x: 4, y: 0 });
  });
});
