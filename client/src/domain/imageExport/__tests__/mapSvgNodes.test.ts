import { createMapSvgNodes } from "@/domain/imageExport/mapSvgNodes";
import { createTestNode } from "@/testing/createTestNode";

const measureText = (text: string) => Array.from(text).length * 10;

it("矩形と中央揃えラベルを出力オフセット込みで生成する", () => {
  const nodes = [
    createTestNode({ x: -20, y: 10, label: "Parent" }),
  ];
  const bounds = { minX: -20, minY: 10, width: 164, height: 124, offsetX: 52, offsetY: 22 };

  const markup = createMapSvgNodes(nodes, bounds, measureText);

  expect(markup.rectangles).toContain(
    '<rect x="32" y="32" width="100" height="60" fill="#ffffff" stroke="#3b82f6" stroke-width="2" />',
  );
  expect(markup.labels).toContain(
    '<tspan x="82" y="66.66666666666667">Parent</tspan>',
  );
});

it.each([10, 16])("幅%sでもサロゲートペアを分割せずに折り返す", (width) => {
  const nodes = [
    createTestNode({ width, label: "A😀B" }),
  ];
  const bounds = { minX: 0, minY: 0, width: 80, height: 124, offsetX: 32, offsetY: 32 };
  let measurements = 0;
  const boundedMeasure = (text: string) => {
    if (++measurements > 100) throw new Error("SVG text wrapping did not terminate");
    return measureText(text);
  };

  const markup = createMapSvgNodes(nodes, bounds, boundedMeasure);
  const parsed = new DOMParser().parseFromString(`<svg>${markup.labels}</svg>`, "image/svg+xml");

  expect(parsed.querySelector("parsererror")).toBeNull();
  expect(Array.from(parsed.querySelectorAll("tspan"), (span) => span.textContent))
    .toEqual(["A", "😀", "B"]);
});

it.each([0x00, 0x08, 0x0b, 0x0c, 0x0e, 0x1f, 0xd800, 0xdfff, 0xfffe, 0xffff])(
  "XML禁止文字と構造文字を含むラベルを解析可能なSVGテキストにする（コードポイント%i）",
  (codePoint) => {
    const nodes = [
      createTestNode({
        id: 1, parentId: null, x: 0, y: 0, width: 300, height: 60,
        label: `A${String.fromCodePoint(codePoint)}B<script>&\"'`,
      }),
    ];
    const bounds = { minX: 0, minY: 0, width: 364, height: 124, offsetX: 32, offsetY: 32 };

    const markup = createMapSvgNodes(nodes, bounds, measureText);
    const parsed = new DOMParser().parseFromString(`<svg>${markup.labels}</svg>`, "image/svg+xml");

    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelector("text")?.textContent).toBe(`A\uFFFDB<script>&\"'`);
    expect(parsed.querySelector("script")).toBeNull();
  },
);

it("明示改行と負座標を出力座標へ保持する", () => {
  const nodes = [
    createTestNode({ x: -80, y: -50, height: 100, label: "First\nSecond" }),
  ];
  const bounds = { minX: -80, minY: -50, width: 164, height: 164, offsetX: 112, offsetY: 82 };

  const markup = createMapSvgNodes(nodes, bounds, measureText);

  expect(markup.rectangles).toBe(
    '<rect x="32" y="32" width="100" height="100" fill="#ffffff" stroke="#3b82f6" stroke-width="2" />',
  );
  expect(markup.labels).toContain('<tspan x="82" y="77.66666666666667">First</tspan>');
  expect(markup.labels).toContain('<tspan x="82" y="95.66666666666667">Second</tspan>');
});

it("前後・連続空白をSVG描画時にも保持する", () => {
  const nodes = [
    createTestNode({ width: 200, label: "  A  B  " }),
  ];
  const bounds = { minX: 0, minY: 0, width: 264, height: 124, offsetX: 32, offsetY: 32 };

  const markup = createMapSvgNodes(nodes, bounds, measureText);
  const parsed = new DOMParser().parseFromString(`<svg>${markup.labels}</svg>`, "image/svg+xml");
  const text = parsed.querySelector("text");

  expect(text?.getAttribute("xml:space")).toBe("preserve");
  expect(text?.textContent).toBe("  A  B  ");
});

it("凍結された入力を変更しない", () => {
  const node = Object.freeze(createTestNode({
    id: 1,
    parentId: null,
    x: 4,
    y: 6,
    width: 100,
    height: 60,
    label: "Fixed",
  }));
  const nodes = Object.freeze([node]);
  const bounds = Object.freeze({
    minX: 4, minY: 6, width: 164, height: 124, offsetX: 28, offsetY: 26,
  });

  expect(() => createMapSvgNodes(nodes, bounds, measureText)).not.toThrow();
  expect(nodes).toEqual([node]);
});
