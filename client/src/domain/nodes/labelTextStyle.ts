import type { Node } from "@/types/node";
import {
  LABEL_FONT_SIZES,
  type LabelFontSize,
} from "@/types/labelFontSize";

export { LABEL_FONT_SIZES, type LabelFontSize };
export const DEFAULT_LABEL_FONT_SIZE: LabelFontSize = 14;

export type LabelTextStyleFields = Pick<
  Node,
  "labelFontSize" | "labelBold" | "labelUnderline"
>;

export type LabelTextPresentation = {
  fontSize: LabelFontSize;
  fontWeight: "bold" | "normal";
  textDecoration: "underline" | "none";
};

export function isLabelFontSize(value: unknown): value is LabelFontSize {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (LABEL_FONT_SIZES as readonly number[]).includes(value)
  );
}

export function resolveLabelFontSize(node: Pick<Node, "labelFontSize">): LabelFontSize {
  return isLabelFontSize(node.labelFontSize) ? node.labelFontSize : DEFAULT_LABEL_FONT_SIZE;
}

export function resolveLabelBold(node: Pick<Node, "labelBold">): boolean {
  return node.labelBold === true;
}

export function resolveLabelUnderline(node: Pick<Node, "labelUnderline">): boolean {
  return node.labelUnderline === true;
}

/** 描画・HTML 向けの実効書式（欠落＝標準） */
export function resolveLabelTextPresentation(
  node: LabelTextStyleFields,
): LabelTextPresentation {
  return {
    fontSize: resolveLabelFontSize(node),
    fontWeight: resolveLabelBold(node) ? "bold" : "normal",
    textDecoration: resolveLabelUnderline(node) ? "underline" : "none",
  };
}

/** 正本。14 / 非 bold / 非 underline はキー省略 */
export function projectLabelTextStyle(
  node: LabelTextStyleFields,
): {
  labelFontSize?: LabelFontSize;
  labelBold?: true;
  labelUnderline?: true;
} {
  const size = isLabelFontSize(node.labelFontSize) ? node.labelFontSize : undefined;
  return {
    ...(size !== undefined && size !== DEFAULT_LABEL_FONT_SIZE ? { labelFontSize: size } : {}),
    ...(node.labelBold === true ? { labelBold: true as const } : {}),
    ...(node.labelUnderline === true ? { labelUnderline: true as const } : {}),
  };
}

/** 既存の書式キーを外して投影結果を載せる（更新・統合の共通経路） */
export function applyProjectedLabelTextStyle(
  node: Node,
  style: LabelTextStyleFields,
): Node {
  const projected = projectLabelTextStyle(style);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で書式キーを除外するため
  const { labelFontSize: _size, labelBold: _bold, labelUnderline: _underline, ...rest } = node;
  return { ...rest, ...projected };
}

export function areLabelTextStylesEqual(
  a: LabelTextStyleFields,
  b: LabelTextStyleFields,
): boolean {
  return (
    resolveLabelFontSize(a) === resolveLabelFontSize(b) &&
    resolveLabelBold(a) === resolveLabelBold(b) &&
    resolveLabelUnderline(a) === resolveLabelUnderline(b)
  );
}
