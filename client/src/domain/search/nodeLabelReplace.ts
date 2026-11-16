import { normalizeNodeSearchText } from "@/domain/search/nodeLabelSearch";
import type { Node } from "@/types/node";

export type LabelReplaceRequest = {
  // 入力どおり（trim しない）。正規化後に空なら一致なし
  query: string;
  // 入力どおりラベルへ入れる（正規化しない）
  replacement: string;
  // null なら全ノード。空集合なら何も対象にしない
  targetIds: ReadonlySet<number> | null;
};

export type LabelReplaceRowStatus = "replace" | "emptied" | "unchanged";

export type LabelReplaceRow = {
  nodeId: number;
  before: string;
  after: string;
  // 位置を元のラベルへ対応づけられた出現の数（1 以上）
  matchCount: number;
  status: LabelReplaceRowStatus;
};

export type LabelReplacePlan = {
  rows: readonly LabelReplaceRow[];
  replaceCount: number;
  emptiedCount: number;
};

type ReplaceRange = { start: number; end: number };

const EMPTY_PLAN: LabelReplacePlan = { rows: [], replaceCount: 0, emptiedCount: 0 };

// コードポイントの境界（UTF-16 の位置）を小さい順に返す。0 と末尾を含む
function listCodePointBoundaries(label: string): number[] {
  const boundaries = [0];
  let index = 0;
  for (const char of label) {
    index += char.length;
    boundaries.push(index);
  }
  return boundaries;
}

// 正規化後の長さ → 元のラベルの境界。有効な境界（その手前までを正規化した文字列が、全体を正規化した文字列の
// 接頭辞になる境界）だけを入れる。結合文字や合字、小文字化で長さが変わる文字の途中の境界は有効にならない
function mapNormalizedLengthToBoundary(label: string, normalizedLabel: string): Map<number, number> {
  const lengthToBoundary = new Map<number, number>();
  for (const boundary of listCodePointBoundaries(label)) {
    const prefix = normalizeNodeSearchText(label.slice(0, boundary));
    if (!normalizedLabel.startsWith(prefix)) continue;
    if (!lengthToBoundary.has(prefix.length)) lengthToBoundary.set(prefix.length, boundary);
  }
  return lengthToBoundary;
}

// 正規化後の文字列で重ならない一致を左から探し、元のラベルの範囲へ戻す。
// 戻せない一致は一致として扱わず、直後の位置から探し直す（成功した一致は末尾から続ける）
function findReplaceRanges(label: string, normalizedQuery: string): ReplaceRange[] {
  const normalizedLabel = normalizeNodeSearchText(label);
  if (!normalizedLabel.includes(normalizedQuery)) return [];

  const lengthToBoundary = mapNormalizedLengthToBoundary(label, normalizedLabel);
  const ranges: ReplaceRange[] = [];
  let position = 0;
  for (;;) {
    const found = normalizedLabel.indexOf(normalizedQuery, position);
    if (found === -1) break;
    const foundEnd = found + normalizedQuery.length;
    const start = lengthToBoundary.get(found);
    const end = lengthToBoundary.get(foundEnd);
    if (start !== undefined && end !== undefined && start < end) {
      ranges.push({ start, end });
      position = foundEnd;
    } else {
      position = found + 1;
    }
  }
  return ranges;
}

// 後ろの範囲から置き換え、前の範囲の位置がずれないようにする。String.replace は特殊パターンを解釈するので使わない
function replaceRanges(label: string, ranges: readonly ReplaceRange[], replacement: string): string {
  let result = label;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const { start, end } = ranges[index];
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

function resolveStatus(before: string, after: string): LabelReplaceRowStatus {
  if (after === before) return "unchanged";
  return after === "" ? "emptied" : "replace";
}

export function planLabelReplace(
  nodes: readonly Node[],
  request: LabelReplaceRequest,
): LabelReplacePlan {
  const normalizedQuery = normalizeNodeSearchText(request.query);
  if (normalizedQuery === "") return EMPTY_PLAN;

  const rows: LabelReplaceRow[] = [];
  for (const node of nodes) {
    if (request.targetIds !== null && !request.targetIds.has(node.id)) continue;
    const ranges = findReplaceRanges(node.label, normalizedQuery);
    if (ranges.length === 0) continue;

    const after = replaceRanges(node.label, ranges, request.replacement);
    rows.push({
      nodeId: node.id,
      before: node.label,
      after,
      matchCount: ranges.length,
      status: resolveStatus(node.label, after),
    });
  }

  return {
    rows,
    replaceCount: rows.filter((row) => row.status === "replace").length,
    emptiedCount: rows.filter((row) => row.status === "emptied").length,
  };
}

// 確定で適用する置換だけを nodeId → 置換後のラベルにする。置換後が空になる行（emptied）と変わらない行（unchanged）は含めない
export function listLabelReplacements(plan: LabelReplacePlan): Map<number, string> {
  const replacements = new Map<number, string>();
  for (const row of plan.rows) {
    if (row.status === "replace") replacements.set(row.nodeId, row.after);
  }
  return replacements;
}
