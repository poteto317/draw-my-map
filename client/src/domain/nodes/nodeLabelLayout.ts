import {
  ILLUSTRATED_NODE_HEIGHT,
  ILLUSTRATION_AREA_HEIGHT,
  RECT_HEIGHT,
  RECT_WIDTH,
} from "@/config/shapes";
import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import {
  DEFAULT_LABEL_FONT_SIZE,
  resolveLabelFontSize,
} from "@/domain/nodes/labelTextStyle";
import type { Node } from "@/types/node";

/** ラベル折り返し幅から差し引く水平パディング合計（pixi wordWrapWidth と同値） */
export const NODE_LABEL_HORIZONTAL_PADDING = 16;
/** ノード高さのうち本文以外に確保する垂直パディング */
export const NODE_LABEL_VERTICAL_PADDING = 16;
/** 折り返し本文が収まる高さの上限 */
export const NODE_LABEL_CONTENT_MAX_HEIGHT =
  RECT_HEIGHT * 4 - NODE_LABEL_VERTICAL_PADDING;

/**
 * export（mapExportText）の MAP_EXPORT_LINE_HEIGHT / MAP_EXPORT_FONT_SIZE と同比率。
 * domain は canvas/Pixi 非依存のため services の measure は import しない（L-467）。
 */
const LINE_HEIGHT_PER_FONT_SIZE = 18 / 14;

export type FitMode = "commit" | "growOnly";

export type EllipsizedWrappedLabel = {
  text: string;
  truncated: boolean;
};

function getLabelLineHeight(fontSize: number): number {
  return fontSize * LINE_HEIGHT_PER_FONT_SIZE;
}

/**
 * Canvas / Pixi に頼らない決定的な幅近似（CJK はほぼ全角、ASCII は約 0.55em）。
 * export の measureText と同系のヒューリスティックだが、依存逆転を避けるためここへ閉じる。
 */
function approximateCharWidth(codePoint: string, fontSize: number): number {
  const code = codePoint.codePointAt(0) ?? 0;
  return code < 0x100 ? fontSize * 0.55 : fontSize;
}

function approximateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const codePoint of text) {
    width += approximateCharWidth(codePoint, fontSize);
  }
  return width;
}

/** 幅を文字ごとに累積し、contentWidth を超える直前で折る（O(n)） */
function wrapExplicitLine(
  explicitLine: string,
  contentWidth: number,
  fontSize: number,
): string[] {
  if (explicitLine.length === 0) return [""];
  if (contentWidth <= 0) return Array.from(explicitLine);

  const codePoints = Array.from(explicitLine);
  const lines: string[] = [];
  let start = 0;

  while (start < codePoints.length) {
    let width = 0;
    let end = start;
    while (end < codePoints.length) {
      const next = approximateCharWidth(codePoints[end]!, fontSize);
      // 1 文字目は幅超過でも強制で進める
      if (end > start && width + next > contentWidth) break;
      width += next;
      end += 1;
    }
    lines.push(codePoints.slice(start, end).join(""));
    start = end;
  }

  return lines;
}

function wrapLabelLines(
  text: string,
  contentWidth: number,
  fontSize: number,
): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((explicitLine) =>
      wrapExplicitLine(explicitLine, contentWidth, fontSize),
    );
}

export function measureWrappedLabelBodyHeight(input: {
  text: string;
  fontSize: number;
  contentWidth: number;
}): number {
  const displayText = getNodeDisplayLabel(input.text);
  const lines = wrapLabelLines(
    displayText,
    input.contentWidth,
    input.fontSize,
  );
  return lines.length * getLabelLineHeight(input.fontSize);
}

const ELLIPSIS = "…";

/** 最終行に … を付けても contentWidth を超えないよう、必要なら末尾 code point を削る */
function appendEllipsisWithinWidth(
  line: string,
  contentWidth: number,
  fontSize: number,
): string {
  const codePoints = Array.from(line);
  let end = codePoints.length;
  while (end >= 0) {
    const candidate = `${codePoints.slice(0, end).join("")}${ELLIPSIS}`;
    if (
      contentWidth <= 0 ||
      approximateTextWidth(candidate, fontSize) <= contentWidth
    ) {
      return candidate;
    }
    end -= 1;
  }
  return ELLIPSIS;
}

/**
 * domain wrap を正本とする表示文字列。truncated 時は末尾に …。
 * 呼び出し側は常に wordWrap:false で描画する（Pixi 実 wrap との二重エンジンを避ける）。
 */
export function ellipsizeWrappedLabel(input: {
  text: string;
  fontSize: number;
  contentWidth: number;
  maxContentHeight: number;
}): EllipsizedWrappedLabel {
  const displayText = getNodeDisplayLabel(input.text);
  const lineHeight = getLabelLineHeight(input.fontSize);
  const maxLines = Math.max(1, Math.floor(input.maxContentHeight / lineHeight));
  const lines = wrapLabelLines(
    displayText,
    input.contentWidth,
    input.fontSize,
  );

  if (lines.length <= maxLines) {
    return { text: lines.join("\n"), truncated: false };
  }

  const kept = lines.slice(0, maxLines);
  const lastIndex = kept.length - 1;
  kept[lastIndex] = appendEllipsisWithinWidth(
    kept[lastIndex]!,
    input.contentWidth,
    input.fontSize,
  );
  return { text: kept.join("\n"), truncated: true };
}

/** プレースホルダ等、Node 未生成時に commit fit 相当の高さだけ求める */
export function fittedHeightForLabel(
  label: string,
  options: {
    width?: number;
    fontSize?: number;
    hasIllustration?: boolean;
  } = {},
): number {
  const width = options.width ?? RECT_WIDTH;
  const fontSize = options.fontSize ?? DEFAULT_LABEL_FONT_SIZE;
  const hasIllustration = options.hasIllustration ?? false;
  const contentWidth = width - NODE_LABEL_HORIZONTAL_PADDING;
  const measured = measureWrappedLabelBodyHeight({
    text: label,
    fontSize,
    contentWidth,
  });
  const body = Math.min(measured, NODE_LABEL_CONTENT_MAX_HEIGHT);
  const needed =
    body +
    NODE_LABEL_VERTICAL_PADDING +
    (hasIllustration ? ILLUSTRATION_AREA_HEIGHT : 0);
  const minHeight = hasIllustration ? ILLUSTRATED_NODE_HEIGHT : RECT_HEIGHT;
  return Math.max(needed, minHeight);
}

function computeFittedHeight(node: Node): number {
  return fittedHeightForLabel(node.label, {
    width: node.width,
    fontSize: resolveLabelFontSize(node),
    hasIllustration: node.illustration !== undefined,
  });
}

export function fitNodeHeightToLabel(node: Node, mode: FitMode): Node {
  // 不正ジオメトリは検証側（placement-failed）に任せ、ここで「修復」しない
  if (hasInvalidNodeGeometry([node])) return node;
  const fittedHeight = computeFittedHeight(node);
  const height =
    mode === "growOnly" ? Math.max(node.height, fittedHeight) : fittedHeight;
  if (height === node.height) return node;
  return { ...node, height };
}

/**
 * ラベル表示に効く属性（label / illustration / labelFontSize）が新規または変化したときだけ fit。
 * AI 適用など「触ったノードだけ commit fit」する入口の判定をここに集約する。
 */
export function fitNodeHeightToLabelIfContentChanged(
  previous: Node | undefined,
  node: Node,
  mode: FitMode,
): Node {
  if (
    previous !== undefined
    && previous.label === node.label
    && previous.illustration === node.illustration
    && previous.labelFontSize === node.labelFontSize
  ) {
    return node;
  }
  return fitNodeHeightToLabel(node, mode);
}

/** ノード矩形内でラベル本文に使える高さ（省略判定の正本） */
export function nodeLabelContentHeightBudget(node: Node): number {
  const illustrationExtra =
    node.illustration !== undefined ? ILLUSTRATION_AREA_HEIGHT : 0;
  return Math.max(
    0,
    node.height - NODE_LABEL_VERTICAL_PADDING - illustrationExtra,
  );
}

export function fitNodesHeightToLabels(
  nodes: readonly Node[],
  mode: FitMode,
): Node[] {
  return nodes.map((node) => fitNodeHeightToLabel(node, mode));
}

/** 同一 id の height が1件でも変わっていれば true（routing 用の純判定） */
export function anyNodeHeightsChanged(
  previous: readonly Node[],
  next: readonly Node[],
): boolean {
  const previousById = new Map(previous.map((node) => [node.id, node]));
  return next.some((node) => {
    const prior = previousById.get(node.id);
    return prior !== undefined && prior.height !== node.height;
  });
}
