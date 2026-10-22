// 箇条書きのテキストを、空行でない行（インデントと残り）の一覧へ分ける。

export type OutlineRawLine = {
  lineNumber: number; // 1 始まり。分割の結果の行番号（空行も数える）
  tabs: number; // 行頭のタブの数 T
  spaces: number; // 行頭の空白の幅 S（半角スペースの数 + 全角スペースの数 × 2）
  rest: string; // インデントの後の残り（未加工）
};

const BOM = "\uFEFF";
const LINE_BREAK_PATTERN = /\r\n|\r|\n/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/g;

// 先頭の1文字が BOM のときだけ取り除く。
export function stripOutlineBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

// \r\n・\r・\n で分割する。U+2028・U+2029・U+0085 では分割しない。
// 入力の文字列は書き戻さないので、改行コードを保たない（L-013 の対象外）。
export function splitOutlineText(text: string): string[] {
  return text.split(LINE_BREAK_PATTERN);
}

// 行頭のタブ・半角スペース・全角スペースを1回の走査で測る。
// ノーブレークスペースなど、ほかの空白はインデントに数えない。
export function measureOutlineIndent(line: string): {
  tabs: number;
  spaces: number;
  rest: string;
} {
  let tabs = 0;
  let spaces = 0;
  let index = 0;

  for (; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\t") {
      tabs += 1;
    } else if (character === " ") {
      spaces += 1;
    } else if (character === "　") {
      spaces += 2;
    } else {
      break;
    }
  }

  return { tabs, spaces, rest: line.slice(index) };
}

// 制御文字（U+0000〜U+001F、U+007F）を半角空白へ置き換えて前後の空白を取り除く。
export function normalizeOutlineRest(rest: string): string {
  return rest.replace(CONTROL_CHARACTER_PATTERN, " ").trim();
}

// 空行かどうかは normalizeOutlineRest の結果が空かで決める。splitOutlineLines が空行を除くのに使う。
// extractOutlineLabel の blank も同じ正規化の結果で判定するので、両者の空行は一致する。
export function isBlankOutlineRest(rest: string): boolean {
  return normalizeOutlineRest(rest) === "";
}

// BOM 除去 → 分割 → 測定 → 空行を除く。入力の順に返す。
export function splitOutlineLines(text: string): OutlineRawLine[] {
  const lines: OutlineRawLine[] = [];
  const rawLines = splitOutlineText(stripOutlineBom(text));

  for (let index = 0; index < rawLines.length; index += 1) {
    const { tabs, spaces, rest } = measureOutlineIndent(rawLines[index]);
    if (isBlankOutlineRest(rest)) continue;
    lines.push({ lineNumber: index + 1, tabs, spaces, rest });
  }

  return lines;
}
