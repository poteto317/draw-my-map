// 箇条書きのテキストを解析する。段階（上限・行の分割・ラベル・階層）を合成し、警告を集計する。
import {
  assignOutlineDepths,
  determineOutlineUnitWidth,
  type OutlineIndentedLine,
} from "./outlineHierarchy";
import { extractOutlineLabel } from "./outlineLabel";
import {
  isOutlineLineCountTooLarge,
  isOutlineTextTooLong,
  OUTLINE_LONG_LABEL_THRESHOLD,
} from "./outlineLimits";
import { splitOutlineLines, type OutlineRawLine } from "./outlineLines";

export type OutlineItem = {
  label: string; // 記号・前後の空白を除き、制御文字を半角空白にした値。空でない
  depth: number; // 0 が一番上の階層。直前の項目の depth + 1 以下
  parentIndex: number | null; // items の添字（自分より前）。depth 0 は null
  lineNumber: number; // 1 始まりの入力の行番号
};

export type OutlineWarningKind =
  | "depth-adjusted"
  | "empty-label"
  | "long-label";

export type OutlineWarning = {
  kind: OutlineWarningKind;
  count: number; // 1 以上
  lineNumbers: number[]; // 先頭の OUTLINE_WARNING_LINE_NUMBER_LIMIT 件まで（昇順）
};

export type ParsedOutline = {
  items: OutlineItem[]; // 入力の順（先行順）。1件以上 OUTLINE_MAX_ITEMS 件以下
  rootCount: number; // depth 0 の件数
  maxDepth: number; // depth の最大値
  warnings: OutlineWarning[]; // count が1以上のものだけ。種類の順は固定
};

export type OutlineParseError =
  | { kind: "too-long"; length: number }
  | { kind: "too-many-lines"; lines: number }
  | { kind: "no-items" };

export type OutlineParseResult =
  | { ok: true; outline: ParsedOutline }
  | { ok: false; error: OutlineParseError };

// 警告に載せる行番号の件数の上限。件数はすべての行を数える。
export const OUTLINE_WARNING_LINE_NUMBER_LIMIT = 5;

// 取り込む行。階層の決定に渡すインデントと、ラベルを持つ。
type OutlineLabeledLine = OutlineIndentedLine & { label: string };

// 各行のラベルを取り出し、取り込む行と記号だけの行の行番号に分ける。
function classifyOutlineLines(lines: readonly OutlineRawLine[]): {
  labeledLines: OutlineLabeledLine[];
  emptyLabelLineNumbers: number[];
} {
  const labeledLines: OutlineLabeledLine[] = [];
  const emptyLabelLineNumbers: number[] = [];

  for (const line of lines) {
    const result = extractOutlineLabel(line.rest);
    switch (result.kind) {
      case "label":
        labeledLines.push({
          lineNumber: line.lineNumber,
          tabs: line.tabs,
          spaces: line.spaces,
          label: result.label,
        });
        break;
      case "marker-only":
        emptyLabelLineNumbers.push(line.lineNumber);
        break;
      case "blank":
        // splitOutlineLines が空行を除くので来ないが、来ても無視する。
        break;
      default: {
        const unreachable: never = result;
        throw new Error(`Unknown outline label: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  return { labeledLines, emptyLabelLineNumbers };
}

// 件数が0なら何も加えない。行番号は入力の順（昇順）で渡す。
function pushOutlineWarning(
  warnings: OutlineWarning[],
  kind: OutlineWarningKind,
  lineNumbers: readonly number[],
): void {
  if (lineNumbers.length === 0) return;
  warnings.push({
    kind,
    count: lineNumbers.length,
    lineNumbers: lineNumbers.slice(0, OUTLINE_WARNING_LINE_NUMBER_LIMIT),
  });
}

// 上限は費用の安い順に、費用のかかる処理の前に判定する（文字数 → 行数 → ラベル → 階層）。
// 入力を変えず、副作用を持たない。
export function parseOutlineText(text: string): OutlineParseResult {
  // 文字数は BOM を除く前の文字列で数える。
  if (isOutlineTextTooLong(text)) {
    return { ok: false, error: { kind: "too-long", length: text.length } };
  }

  const lines = splitOutlineLines(text);
  if (isOutlineLineCountTooLarge(lines.length)) {
    return {
      ok: false,
      error: { kind: "too-many-lines", lines: lines.length },
    };
  }

  const { labeledLines, emptyLabelLineNumbers } = classifyOutlineLines(lines);
  if (labeledLines.length === 0) {
    return { ok: false, error: { kind: "no-items" } };
  }

  const unitWidth = determineOutlineUnitWidth(labeledLines);
  const { depths, parentIndexes, adjustedLineNumbers } = assignOutlineDepths(
    labeledLines,
    unitWidth,
  );

  const items: OutlineItem[] = [];
  const longLabelLineNumbers: number[] = [];
  let rootCount = 0;
  let maxDepth = 0;
  for (let index = 0; index < labeledLines.length; index += 1) {
    const { label, lineNumber } = labeledLines[index];
    const depth = depths[index];
    items.push({ label, depth, parentIndex: parentIndexes[index], lineNumber });
    if (depth === 0) rootCount += 1;
    if (depth > maxDepth) maxDepth = depth;
    if (Array.from(label).length > OUTLINE_LONG_LABEL_THRESHOLD) {
      longLabelLineNumbers.push(lineNumber);
    }
  }

  // 種類の順は depth-adjusted、empty-label、long-label で固定する。
  const warnings: OutlineWarning[] = [];
  pushOutlineWarning(warnings, "depth-adjusted", adjustedLineNumbers);
  pushOutlineWarning(warnings, "empty-label", emptyLabelLineNumbers);
  pushOutlineWarning(warnings, "long-label", longLabelLineNumbers);

  return { ok: true, outline: { items, rootCount, maxDepth, warnings } };
}
