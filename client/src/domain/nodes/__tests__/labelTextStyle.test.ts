import {
  applyProjectedLabelTextStyle,
  areLabelTextStylesEqual,
  DEFAULT_LABEL_FONT_SIZE,
  LABEL_FONT_SIZES,
  projectLabelTextStyle,
  resolveLabelBold,
  resolveLabelFontSize,
  resolveLabelTextPresentation,
  resolveLabelUnderline,
} from "@/domain/nodes/labelTextStyle";
import { createTestNode } from "@/testing/createTestNode";

describe("LABEL_FONT_SIZES", () => {
  it("許可サイズは 12 / 14 / 18 / 24", () => {
    expect(LABEL_FONT_SIZES).toEqual([12, 14, 18, 24]);
    expect(DEFAULT_LABEL_FONT_SIZE).toBe(14);
  });
});

describe("resolveLabelFontSize", () => {
  it.each([12, 14, 18, 24] as const)("許可値 %s をそのまま返す", (size) => {
    expect(resolveLabelFontSize({ labelFontSize: size })).toBe(size);
  });

  it("欠落は標準 14", () => {
    expect(resolveLabelFontSize({})).toBe(14);
    expect(resolveLabelFontSize({ labelFontSize: undefined })).toBe(14);
  });
});

describe("resolveLabelBold / resolveLabelUnderline", () => {
  it("true のときだけ true、欠落は false", () => {
    expect(resolveLabelBold({ labelBold: true })).toBe(true);
    expect(resolveLabelBold({})).toBe(false);
    expect(resolveLabelUnderline({ labelUnderline: true })).toBe(true);
    expect(resolveLabelUnderline({})).toBe(false);
  });
});

describe("projectLabelTextStyle", () => {
  it("14 / 非 bold / 非 underline はキーを省略する", () => {
    expect(projectLabelTextStyle({})).toEqual({});
    expect(projectLabelTextStyle({ labelFontSize: 14 })).toEqual({});
    expect(projectLabelTextStyle({ labelBold: undefined, labelUnderline: undefined })).toEqual({});
  });

  it("12/18/24 と bold/underline true だけを書き出す", () => {
    expect(projectLabelTextStyle({ labelFontSize: 12, labelBold: true, labelUnderline: true })).toEqual({
      labelFontSize: 12,
      labelBold: true,
      labelUnderline: true,
    });
    expect(projectLabelTextStyle({ labelFontSize: 18 })).toEqual({ labelFontSize: 18 });
    expect(projectLabelTextStyle({ labelFontSize: 24, labelBold: true })).toEqual({
      labelFontSize: 24,
      labelBold: true,
    });
  });
});

describe("resolveLabelTextPresentation", () => {
  it("欠落は標準サイズ・通常・下線なし", () => {
    expect(resolveLabelTextPresentation({})).toEqual({
      fontSize: 14,
      fontWeight: "normal",
      textDecoration: "none",
    });
  });

  it("設定値を描画トークンへ写す", () => {
    expect(
      resolveLabelTextPresentation({
        labelFontSize: 18,
        labelBold: true,
        labelUnderline: true,
      }),
    ).toEqual({
      fontSize: 18,
      fontWeight: "bold",
      textDecoration: "underline",
    });
  });
});

describe("applyProjectedLabelTextStyle", () => {
  it("14 / 非 bold へ戻すとキーを外し、他属性は保つ", () => {
    const node = createTestNode({
      id: 1,
      label: "keep",
      labelFontSize: 18,
      labelBold: true,
      labelUnderline: true,
    });

    expect(
      applyProjectedLabelTextStyle(node, {
        labelFontSize: 14,
        labelBold: undefined,
        labelUnderline: true,
      }),
    ).toEqual(createTestNode({ id: 1, label: "keep", labelUnderline: true }));
  });
});

describe("areLabelTextStylesEqual", () => {
  it("欠落の 14 と明示 14 を同一とみなす", () => {
    expect(areLabelTextStylesEqual({}, { labelFontSize: 14 })).toBe(true);
    expect(areLabelTextStylesEqual({ labelBold: true }, { labelBold: true })).toBe(true);
  });

  it("実効値が違えば false", () => {
    expect(areLabelTextStylesEqual({}, { labelFontSize: 18 })).toBe(false);
    expect(areLabelTextStylesEqual({}, { labelBold: true })).toBe(false);
    expect(areLabelTextStylesEqual({ labelUnderline: true }, {})).toBe(false);
  });
});
