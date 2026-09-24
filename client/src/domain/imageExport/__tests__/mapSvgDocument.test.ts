import { createMapSvgDocument } from "@/domain/imageExport/mapSvgDocument";

const measureText = (text: string) => Array.from(text).length * 10;

it("SVGの寸法と背景、辺、ノード、中央揃えラベルを描画順どおりに生成する", () => {
  const nodes = [
    { id: 1, parentId: null, x: -20, y: 10, width: 100, height: 60, label: "Parent" },
    { id: 2, parentId: 1, x: 180, y: 90, width: 120, height: 70, label: "Child nodes" },
  ];
  const bounds = {
    minX: -20,
    minY: 10,
    width: 384,
    height: 214,
    offsetX: 52,
    offsetY: 22,
  };

  const document = createMapSvgDocument(nodes, bounds, measureText);

  expect(document).toMatchObject({ width: 384, height: 214 });
  expect(document.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" version="1.1"');
  expect(document.svg).toContain('width="384" height="214" viewBox="0 0 384 214"');
  expect(document.svg).toContain('<rect width="384" height="214" fill="#ffffff"');
  expect(document.svg).toContain(
    '<path d="M 132 62 C 182 62 182 147 232 147" fill="none" stroke="#64748b" stroke-width="2"',
  );
  expect(document.svg).toContain(
    '<rect x="32" y="32" width="100" height="60" fill="#ffffff" stroke="#3b82f6" stroke-width="2"',
  );
  expect(document.svg).toContain(
    '<text xml:space="preserve" text-anchor="middle" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="#27272a"><tspan x="82" y="66.66666666666667">Parent</tspan></text>',
  );
  expect(document.svg).toContain(
    '<tspan x="292" y="142.66666666666666">Child</tspan><tspan x="292" y="160.66666666666666">nodes</tspan>',
  );

  const backgroundIndex = document.svg.indexOf('<rect width="384"');
  const pathIndex = document.svg.indexOf("<path ");
  const firstNodeIndex = document.svg.indexOf('<rect x="32"');
  const lastNodeIndex = document.svg.indexOf('<rect x="232"');
  const labelIndex = document.svg.indexOf("<text ");
  expect(backgroundIndex).toBeLessThan(pathIndex);
  expect(pathIndex).toBeLessThan(firstNodeIndex);
  expect(firstNodeIndex).toBeLessThan(lastNodeIndex);
  expect(lastNodeIndex).toBeLessThan(labelIndex);
});
