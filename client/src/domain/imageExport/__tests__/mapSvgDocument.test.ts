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
  expect(document.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  expect(document.svg).toContain('width="384" height="214" viewBox="0 0 384 214"');
  expect(document.svg).toContain('<rect width="384" height="214" fill="#ffffff"');
  expect(document.svg).toContain(
    '<path d="M 132 62 C 182 62 182 147 232 147" fill="none" stroke="#64748b" stroke-width="2"',
  );
  expect(document.svg).toContain(
    '<rect x="32" y="32" width="100" height="60" fill="#ffffff" stroke="#3b82f6" stroke-width="2"',
  );
  expect(document.svg).toContain(
    '<text text-anchor="middle" font-size="14" fill="#27272a"><tspan x="82" y="66.66666666666667">Parent</tspan></text>',
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

it("ラベルのXML特殊文字をすべてエスケープする", () => {
  const nodes = [
    { id: 1, parentId: null, x: 0, y: 0, width: 200, height: 60, label: `<script>&"'` },
  ];
  const bounds = { minX: 0, minY: 0, width: 264, height: 124, offsetX: 32, offsetY: 32 };

  const { svg } = createMapSvgDocument(nodes, bounds, measureText);

  expect(svg).toContain("&lt;script&gt;&amp;&quot;&apos;");
  expect(svg).not.toContain(`<script>&"'`);
});

it("親ノードが存在しない子には辺を描画しない", () => {
  const nodes = [
    { id: 2, parentId: 999, x: 10, y: 20, width: 100, height: 60, label: "Orphan" },
  ];
  const bounds = { minX: 10, minY: 20, width: 164, height: 124, offsetX: 22, offsetY: 12 };

  expect(createMapSvgDocument(nodes, bounds, measureText).svg).not.toContain("<path ");
});

it("負のワールド座標を出力範囲内の座標へ変換する", () => {
  const nodes = [
    { id: 1, parentId: null, x: -80, y: -50, width: 100, height: 60, label: "Negative" },
  ];
  const bounds = { minX: -80, minY: -50, width: 164, height: 124, offsetX: 112, offsetY: 82 };

  const { svg } = createMapSvgDocument(nodes, bounds, measureText);

  expect(svg).toContain('<rect x="32" y="32" width="100" height="60"');
  expect(svg).toContain('<tspan x="82" y="66.66666666666667">Negative</tspan>');
});

it("凍結されたノードを変更せずにSVGを生成する", () => {
  const node = Object.freeze({
    id: 1,
    parentId: null,
    x: 4,
    y: 6,
    width: 100,
    height: 60,
    label: "Fixed",
  });
  const nodes = Object.freeze([node]);
  const bounds = { minX: 4, minY: 6, width: 164, height: 124, offsetX: 28, offsetY: 26 };

  expect(() => createMapSvgDocument(nodes, bounds, measureText)).not.toThrow();
  expect(node).toEqual({
    id: 1,
    parentId: null,
    x: 4,
    y: 6,
    width: 100,
    height: 60,
    label: "Fixed",
  });
});
