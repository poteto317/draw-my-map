import { createMapSvgEdges } from "@/domain/imageExport/mapSvgEdges";

it("存在する親子関係だけを入力順と出力オフセットで辺にし、入力を変更しない", () => {
  const parent = Object.freeze({
    id: 1,
    parentId: null,
    x: -20,
    y: 10,
    width: 100,
    height: 60,
    label: "Parent",
    importance: "medium" as const,
  });
  const child = Object.freeze({
    id: 2,
    parentId: 1,
    x: 180,
    y: 90,
    width: 120,
    height: 70,
    label: "Child",
    importance: "medium" as const,
  });
  const orphan = Object.freeze({
    id: 3,
    parentId: 999,
    x: 300,
    y: 20,
    width: 100,
    height: 60,
    label: "Orphan",
    importance: "medium" as const,
  });
  const nodes = Object.freeze([parent, child, orphan]);
  const bounds = Object.freeze({
    minX: -20,
    minY: 10,
    width: 484,
    height: 214,
    offsetX: 52,
    offsetY: 22,
  });

  expect(createMapSvgEdges(nodes, bounds)).toBe(
    '<path d="M 132 62 C 182 62 182 147 232 147" fill="none" stroke="#64748b" stroke-width="2" />',
  );
  expect(nodes).toEqual([parent, child, orphan]);
});
