import { getMapExportBounds } from "@/domain/imageExport/mapExportBounds";

const measureText = (text: string) => Array.from(text).length * 10;

it("全ノードの外接矩形に32pxの余白を追加する", () => {
  const nodes = [
    { id: 1, parentId: null, x: -20, y: 10, width: 100, height: 60, label: "A" },
    { id: 2, parentId: 1, x: 180, y: 90, width: 120, height: 70, label: "B" },
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
  const nodes = [{ id: 7, parentId: null, x: 12, y: -8, width: 30, height: 18, label: "A" }];

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
  const nodes = [{ id: 7, parentId: null, x: 12, y: -8, width: 30, height: 18, label: "A" }];

  expect(getMapExportBounds(nodes, measureText, 5)).toEqual({
    minX: 12,
    minY: -8,
    width: 40,
    height: 28,
    offsetX: -7,
    offsetY: 13,
  });
});

it("ノードの高さを超える複数行ラベルを出力範囲に含める", () => {
  const nodes = [{
    id: 1,
    parentId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 64,
    label: Array.from({ length: 10 }, (_, index) => `Line ${index + 1}`).join("\n"),
  }];

  expect(getMapExportBounds(nodes, measureText)).toEqual({
    minX: 0,
    minY: -58,
    width: 164,
    height: 244,
    offsetX: 32,
    offsetY: 90,
  });
});

it("凍結された入力配列を変更せずに範囲を計算する", () => {
  const nodes = Object.freeze([
    Object.freeze({ id: 1, parentId: null, x: 4, y: 6, width: 10, height: 20, label: "Fixed" }),
  ]);

  expect(() => getMapExportBounds(nodes, measureText)).not.toThrow();
  expect(nodes[0]).toEqual({ id: 1, parentId: null, x: 4, y: 6, width: 10, height: 20, label: "Fixed" });
});
