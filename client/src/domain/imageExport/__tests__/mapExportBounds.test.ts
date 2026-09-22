import { getMapExportBounds } from "@/domain/imageExport/mapExportBounds";

it("全ノードの外接矩形に32pxの余白を追加する", () => {
  const nodes = [
    { id: 1, parentId: null, x: -20, y: 10, width: 100, height: 60, label: "A" },
    { id: 2, parentId: 1, x: 180, y: 90, width: 120, height: 70, label: "B" },
  ];

  expect(getMapExportBounds(nodes)).toEqual({
    minX: -20,
    minY: 10,
    width: 384,
    height: 214,
    offsetX: 52,
    offsetY: 22,
  });
});

it("空のマップには出力範囲がない", () => {
  expect(getMapExportBounds([])).toBeNull();
});

it("単一ノードにも既定の余白を適用する", () => {
  const nodes = [{ id: 7, parentId: null, x: 12, y: -8, width: 30, height: 18, label: "Solo" }];

  expect(getMapExportBounds(nodes)).toEqual({
    minX: 12,
    minY: -8,
    width: 94,
    height: 82,
    offsetX: 20,
    offsetY: 40,
  });
});

it("凍結された入力配列を変更せずに範囲を計算する", () => {
  const nodes = Object.freeze([
    Object.freeze({ id: 1, parentId: null, x: 4, y: 6, width: 10, height: 20, label: "Fixed" }),
  ]);

  expect(() => getMapExportBounds(nodes)).not.toThrow();
  expect(nodes[0]).toEqual({ id: 1, parentId: null, x: 4, y: 6, width: 10, height: 20, label: "Fixed" });
});
