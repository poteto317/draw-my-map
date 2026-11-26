import {
  calculateMapPrintLayout,
  MapPrintLayoutError,
} from "@/domain/printExport/mapPrintLayout";
import {
  DEFAULT_MAP_PRINT_SETTINGS,
  type MapPrintSettings,
} from "@/types/mapPrintExport";

const defaults = DEFAULT_MAP_PRINT_SETTINGS;
const tile: MapPrintSettings = { ...defaults, pagination: "tile" };

function expectLayoutError(
  calculate: () => unknown,
  reason: MapPrintLayoutError["reason"],
) {
  expect(calculate).toThrow(RangeError);
  expect(calculate).toThrow(expect.objectContaining({ reason }));
}

describe("calculateMapPrintLayout", () => {
  it.each([
    ["a4", "portrait", 210, 297, 190, 277],
    ["a3", "portrait", 297, 420, 277, 400],
    ["letter", "landscape", 279.4, 215.9, 259.4, 195.9],
  ] as const)(
    "%s %sの用紙と既定余白の印字領域を求める",
    (paperSize, orientation, paperWidthMm, paperHeightMm, contentWidthMm, contentHeightMm) => {
      const result = calculateMapPrintLayout(200, 100, { ...defaults, paperSize, orientation });

      expect(result).toMatchObject({
        paperWidthMm, paperHeightMm, contentWidthMm, contentHeightMm,
      });
    },
  );

  it("上下左右の非対称余白から印字領域を求める", () => {
    const result = calculateMapPrintLayout(200, 100, {
      ...defaults,
      margins: { top: 5.1, right: 50, bottom: 0, left: 3.2 },
    });

    expect(result.contentWidthMm).toBeCloseTo(156.8);
    expect(result.contentHeightMm).toBeCloseTo(291.9);
  });

  it.each([
    [200, 100, 0, 91, 190, 95],
    [100, 400, 60.375, 0, 69.25, 277],
  ])("全体1ページで%d×%dの画像を比率を保って中央に拡大する",
    (width, height, leftMm, topMm, widthMm, heightMm) => {
      const result = calculateMapPrintLayout(width, height, defaults);
      expect(result).toMatchObject({ columns: 1, rows: 1 });
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].leftMm).toBeCloseTo(leftMm);
      expect(result.pages[0].topMm).toBeCloseTo(topMm);
      expect(result.pages[0].widthMm).toBeCloseTo(widthMm);
      expect(result.pages[0].heightMm).toBeCloseTo(heightMm);
    },
  );

  it("実寸タイルを左から右、上から下へ並べ、最後の余りを詰めない", () => {
    const result = calculateMapPrintLayout(800, 1200, tile);

    expect(result).toMatchObject({ columns: 2, rows: 2 });
    expect(result.pages.map(({ leftMm, topMm }) => [leftMm, topMm])).toEqual([
      [0, 0], [-190, 0], [0, -277], [-190, -277],
    ]);
    for (const page of result.pages) {
      expect(page.widthMm).toBeCloseTo(211.6666666667);
      expect(page.heightMm).toBeCloseTo(317.5);
    }
  });

  it.each([
    [0, 2],
    [0.9e-9, 2],
    [1.1e-9, 3],
  ])("印字領域との商に誤差 %s があるとき列数を %d とする", (delta, columns) => {
    const width = (2 + delta) * 190 * 96 / 25.4;
    const result = calculateMapPrintLayout(width, 100, tile);

    expect(result.columns).toBe(columns);
    expect(result.pages).toHaveLength(columns);
    expect(result.pages[1].leftMm).toBe(-190);
  });

  it("100ページを許可し、101ページを上限エラーにする", () => {
    const pageWidthPx = 190 * 96 / 25.4;

    expect(calculateMapPrintLayout(pageWidthPx * 100, 100, tile).pages).toHaveLength(100);
    expectLayoutError(() => calculateMapPrintLayout(pageWidthPx * 101, 100, tile), "page-limit");
  });

  it("正の寸法が印字領域より十分小さくても1ページを割り当てる", () => {
    const result = calculateMapPrintLayout(1e-7, 1e-7, tile);

    expect(result).toMatchObject({ columns: 1, rows: 1 });
    expect(result.pages).toHaveLength(1);
  });

  it.each([
    [0, 1],
    [1, -1],
    [NaN, 1],
    [1, Infinity],
    [Number.MIN_VALUE, 1],
    [Number.MAX_VALUE, 1e-20],
  ])("正の有限な物理寸法にできない %s×%s を拒否する", (width, height) => {
    expectLayoutError(() => calculateMapPrintLayout(width, height, defaults), "invalid-settings");
  });

  it("巨大な実寸タイルをページ生成前に拒否する", () => {
    expectLayoutError(
      () => calculateMapPrintLayout(Number.MAX_VALUE, Number.MAX_VALUE, tile),
      "page-limit",
    );
  });

  it.each([-0.1, NaN, Infinity, 50.1, 0.01, 12.300000000000002, "", undefined])(
    "不正な余白 %s を拒否する",
    (left) => {
      const settings = {
        ...defaults,
        margins: { ...defaults.margins, left },
      } as MapPrintSettings;

      expectLayoutError(() => calculateMapPrintLayout(200, 100, settings), "invalid-settings");
    },
  );

  it.each([
    { paperSize: "constructor" },
    { orientation: "square" },
    { pagination: "custom" },
  ])("未対応の列挙値 %o を拒否する", (overrides) => {
    const settings = { ...defaults, ...overrides } as MapPrintSettings;

    expectLayoutError(() => calculateMapPrintLayout(200, 100, settings), "invalid-settings");
  });
});
