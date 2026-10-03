import { createMapSvgDocument } from "@/domain/imageExport/mapSvgDocument";
import { createTestNode } from "@/testing/createTestNode";

const measureText = (text: string) => Array.from(text).length * 10;

it("SVGの寸法と背景、辺、ノード、中央揃えラベルを描画順どおりに生成する", () => {
  const nodes = [
    createTestNode({ id: 1, x: -20, y: 10, label: "Parent" }),
    createTestNode({ id: 2, parentId: 1, x: 180, y: 90, width: 120, height: 70, label: "Child nodes" }),
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

it("イラストは、ノードの矩形の後、ラベルの前に描画する", () => {
  const nodes = [createTestNode({ x: 0, y: 0, height: 116, label: "A", illustration: "data:image/jpeg;base64,AAAA" })];
  const bounds = { minX: 0, minY: 0, width: 164, height: 180, offsetX: 32, offsetY: 32 };

  const { svg } = createMapSvgDocument(nodes, bounds, measureText);

  expect(svg.indexOf('<rect x="32"')).toBeGreaterThan(svg.indexOf('<rect width="164"'));
  expect(svg.indexOf("<image ")).toBeGreaterThan(svg.indexOf('<rect x="32"'));
  expect(svg.indexOf("<text ")).toBeGreaterThan(svg.indexOf("<image "));
});

describe("イラスト付きSVGのxlink:href", () => {
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const IMAGE = "data:image/jpeg;base64,AAAA";
  const nodes = [createTestNode({ x: 0, y: 0, height: 116, label: "A", illustration: IMAGE })];
  const bounds = { minX: 0, minY: 0, width: 164, height: 180, offsetX: 32, offsetY: 32 };

  it("ルートが xmlns:xlink を宣言する", () => {
    const { svg } = createMapSvgDocument(nodes, bounds, measureText);
    expect(svg).toContain(`version="1.1" xmlns:xlink="${XLINK_NS}"`);
  });

  it("イラスト付きSVG全体が、XMLとして不正にならない", () => {
    const { svg } = createMapSvgDocument(nodes, bounds, measureText);
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
  });

  it("<image> は、href と xlink:href の両方に data URL を持つ", () => {
    const { svg } = createMapSvgDocument(nodes, bounds, measureText);
    const image = new DOMParser().parseFromString(svg, "image/svg+xml").getElementsByTagName("image")[0];
    expect(image.getAttribute("href")).toBe(IMAGE);
    expect(image.getAttributeNS(XLINK_NS, "href")).toBe(IMAGE);
  });
});
