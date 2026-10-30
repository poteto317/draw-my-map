import { getMapExportBounds } from "@/domain/imageExport/mapExportBounds";
import { createTestNode } from "@/testing/createTestNode";

const measureText = (text: string) => Array.from(text).length * 10;

it("全ノードの外接矩形に32pxの余白を追加する", () => {
  const nodes = [
    createTestNode({ id: 1, x: -20, y: 10, label: "A" }),
    createTestNode({ id: 2, parentId: 1, x: 180, y: 90, width: 120, height: 70, label: "B" }),
  ];

  expect(getMapExportBounds(nodes, measureText)).toEqual({
    minX: -20,
    minY: 10,
    width: 384,
    height: 214,
    offsetX: 52,
    offsetY: 22,
  });
});

it("空のマップには出力範囲がない", () => {
  expect(getMapExportBounds([], measureText)).toBeNull();
});

it("単一ノードにも既定の余白を適用する", () => {
  const nodes = [createTestNode({ id: 7, x: 12, y: -8, width: 30, height: 18, label: "A" })];

  expect(getMapExportBounds(nodes, measureText)).toEqual({
    minX: 12,
    minY: -8,
    width: 94,
    height: 82,
    offsetX: 20,
    offsetY: 40,
  });
});

it("第3引数で指定した余白を適用する", () => {
  const nodes = [createTestNode({ id: 7, x: 12, y: -8, width: 30, height: 18, label: "A" })];

  expect(getMapExportBounds(nodes, measureText, 5)).toEqual({
    minX: 12,
    minY: -8,
    width: 40,
    height: 28,
    offsetX: -7,
    offsetY: 13,
  });
});

it("負の余白は拒否する", () => {
  const nodes = [createTestNode({ id: 7, x: 12, y: -8, width: 30, height: 18, label: "A" })];

  expect(() => getMapExportBounds(nodes, measureText, -1)).toThrow(
    new RangeError("Map export padding must be a non-negative finite number"),
  );
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  "空のマップでも非有限の余白 %s は拒否する",
  (padding) => {
    expect(() => getMapExportBounds([], measureText, padding)).toThrow(
      new RangeError("Map export padding must be a non-negative finite number"),
    );
  },
);

it("ノードの高さを超える複数行ラベルを出力範囲に含める", () => {
  const nodes = [createTestNode({
    id: 1,
    parentId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 64,
    label: Array.from({ length: 10 }, (_, index) => `Line ${index + 1}`).join("\n"),
  })];

  expect(getMapExportBounds(nodes, measureText)).toEqual({
    minX: 0,
    minY: -58,
    width: 164,
    height: 244,
    offsetX: 32,
    offsetY: 90,
  });
});

it("有限座標間の差がオーバーフローする場合は失敗する", () => {
  // 幅は座標に対して精度が飽和しない大きさにする。幅 1 だと、差の計算より前に
  // ノード単体の右端の精度飽和の検査で失敗し、外接矩形の幅のオーバーフローを確かめられない
  const coordinate = Number.MAX_VALUE / 1.5;
  const nodes = [
    createTestNode({ id: 1, x: -coordinate, width: 1e300, height: 18, label: "A" }),
    createTestNode({ id: 2, x: coordinate, width: 1e300, height: 18, label: "B" }),
  ];

  expect(() => getMapExportBounds(nodes, measureText)).toThrow(
    new RangeError("Map export bounds must be finite"),
  );
});

it.each(["x", "y"] as const)(
  "%s座標への正の寸法加算が精度飽和する場合は失敗する",
  (axis) => {
    const node = createTestNode({
      id: 1,
      parentId: null,
      x: axis === "x" ? Number.MAX_VALUE : 0,
      y: axis === "y" ? Number.MAX_VALUE : 0,
      width: axis === "x" ? 1e291 : 100,
      height: axis === "y" ? 1e291 : 60,
      label: "A",
    });

    expect(() => getMapExportBounds([node], measureText)).toThrow(RangeError);
  },
);

it.each(["x", "y"] as const)(
  "%s座標の平行移動で余白が失われる場合は失敗する",
  (axis) => {
    const coordinate = Number.MAX_VALUE / 2;
    const node = createTestNode({
      id: 1,
      parentId: null,
      x: axis === "x" ? coordinate : 0,
      y: axis === "y" ? coordinate : 0,
      width: axis === "x" ? 2e292 : 100,
      height: axis === "y" ? 2e292 : 60,
      label: "A",
    });

    expect(() => getMapExportBounds([node], measureText)).toThrow(
      new RangeError("Map export bounds must be finite"),
    );
  },
);

it.each([
  { axis: "x", edge: "右端" },
  { axis: "y", edge: "下端" },
] as const)(
  "$edgeの余白が画像境界へ丸められる場合は失敗する",
  ({ axis }) => {
    const dimension = 2e292;
    const nodes = [
      createTestNode({ label: "A" }),
      createTestNode({
        id: 2,
        parentId: null,
        x: axis === "x" ? Number.MAX_VALUE - dimension : 0,
        y: axis === "y" ? Number.MAX_VALUE - dimension : 0,
        width: axis === "x" ? dimension : 100,
        height: axis === "y" ? dimension : 60,
        label: "B",
      }),
    ];

    expect(() => getMapExportBounds(nodes, measureText)).toThrow(
      new RangeError("Map export bounds must be finite"),
    );
  },
);

it("大量のノードでも引数上限に依存せず外接矩形を計算する", () => {
  const node = createTestNode({ label: "A" });
  const nodes = Array.from({ length: 200_000 }, () => node);

  expect(getMapExportBounds(nodes, measureText)).toEqual({
    minX: 0,
    minY: 0,
    width: 164,
    height: 124,
    offsetX: 32,
    offsetY: 32,
  });
});

it("凍結された入力配列を変更せずに範囲を計算する", () => {
  const nodes = Object.freeze([
    Object.freeze(createTestNode({ x: 4, y: 6, width: 10, height: 20, label: "Fixed" })),
  ]);

  expect(() => getMapExportBounds(nodes, measureText)).not.toThrow();
  expect(nodes[0]).toEqual({
    id: 1,
    parentId: null,
    x: 4,
    y: 6,
    width: 10,
    height: 20,
    label: "Fixed",
    importance: "medium",
  });
});

it("イラストがあるノードのテキストは、ノード上端から86px下を中心に計算する", () => {
  const nodes = [createTestNode({ x: 0, y: 0, width: 100, height: 116, label: "A", illustration: "data:image/jpeg;base64,AAAA" })];

  expect(getMapExportBounds(nodes, measureText)).toEqual({
    minX: 0,
    minY: 0,
    width: 164,
    height: 180,
    offsetX: 32,
    offsetY: 32,
  });
});
