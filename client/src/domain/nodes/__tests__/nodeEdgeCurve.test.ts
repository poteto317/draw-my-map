import { getNodeEdgeCurve } from "@/domain/nodes/nodeEdgeCurve";

it("親の右中央から子の左中央へBezier曲線を作る", () => {
  const parent = { id: 1, parentId: null, x: 10, y: 20, width: 100, height: 60, label: "P" };
  const child = { id: 2, parentId: 1, x: 210, y: 100, width: 80, height: 40, label: "C" };

  expect(getNodeEdgeCurve(parent, child)).toEqual({
    start: { x: 110, y: 50 },
    control1: { x: 160, y: 50 },
    control2: { x: 160, y: 120 },
    end: { x: 210, y: 120 },
  });
});

it("同符号の極大有限座標でも有限な制御点を作る", () => {
  const parent = {
    id: 1,
    parentId: null,
    x: Number.MAX_VALUE,
    y: 0,
    width: 1,
    height: 20,
    label: "P",
  };
  const child = {
    id: 2,
    parentId: 1,
    x: Number.MAX_VALUE,
    y: 40,
    width: 1,
    height: 20,
    label: "C",
  };

  expect(getNodeEdgeCurve(parent, child)).toEqual({
    start: { x: Number.MAX_VALUE, y: 10 },
    control1: { x: Number.MAX_VALUE, y: 10 },
    control2: { x: Number.MAX_VALUE, y: 50 },
    end: { x: Number.MAX_VALUE, y: 50 },
  });
});
