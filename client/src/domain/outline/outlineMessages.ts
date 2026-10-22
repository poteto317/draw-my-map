// 箇条書きの取り込みの文言。数値は桁区切りを付け、上限は定数から組み立てる。
import type { ForestInsertionFailureReason } from "@/domain/nodes/nodeForestInsertion";
import {
  OUTLINE_LONG_LABEL_THRESHOLD,
  OUTLINE_MAX_ITEMS,
  OUTLINE_MAX_TEXT_LENGTH,
} from "./outlineLimits";
import type {
  OutlineParseError,
  OutlineWarning,
  ParsedOutline,
} from "./outlineParser";
import type { OutlinePreview } from "./outlinePreview";

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

// 追加する位置の選択肢の文言。親が無いときの失敗の案内がこの文言を引用するので、選択肢の表示と共有する。
export const OUTLINE_ROOT_TARGET_LABEL = "新しいルートとして追加";

export const OUTLINE_TOO_LONG_MESSAGE = `テキストが長すぎます（${formatCount(OUTLINE_MAX_TEXT_LENGTH)}文字以内）。`;

export function formatOutlineCurrentLength(length: number): string {
  return `現在 ${formatCount(length)} 文字`;
}

export function formatOutlineParseError(error: OutlineParseError): string {
  switch (error.kind) {
    case "too-long":
      return OUTLINE_TOO_LONG_MESSAGE;
    case "too-many-lines":
      return `行が多すぎます（空行を除いて${formatCount(OUTLINE_MAX_ITEMS)}行以内）。現在 ${formatCount(error.lines)} 行です。`;
    case "no-items":
      return "取り込める行がありません。空行と記号だけの行は取り込みません。";
    default: {
      const unreachable: never = error;
      throw new Error(`Unknown outline error: ${JSON.stringify(unreachable)}`);
    }
  }
}

// 「（3、7、12行目）」。行番号が件数より少ないときは「ほか」を付ける。
function formatLineNumbers(warning: OutlineWarning): string {
  const rest = warning.lineNumbers.length < warning.count ? "ほか" : "";
  return `（${warning.lineNumbers.join("、")}行目${rest}）`;
}

// 先頭の「注意:」は付けない（表示する部品が付ける）。
export function formatOutlineWarning(warning: OutlineWarning): string {
  const count = formatCount(warning.count);
  const lines = formatLineNumbers(warning);
  switch (warning.kind) {
    case "depth-adjusted":
      return `階層が合わない行を ${count} 行補正しました${lines}。プレビューで親子関係を確かめてください。`;
    case "empty-label":
      return `記号だけの行を ${count} 行取り込みません${lines}。`;
    case "long-label":
      return `${formatCount(OUTLINE_LONG_LABEL_THRESHOLD)}文字を超える行が ${count} 行あります${lines}。そのまま取り込みます。`;
    default: {
      const unreachable: never = warning.kind;
      throw new Error(
        `Unknown outline warning: ${JSON.stringify(unreachable)}`,
      );
    }
  }
}

export function formatOutlinePreviewSummary(outline: ParsedOutline): string {
  return `追加するノード: ${formatCount(outline.items.length)}件（一番上の階層: ${formatCount(outline.rootCount)}件、最も深い階層: ${formatCount(outline.maxDepth + 1)}段目）`;
}

export function formatOutlinePreviewTruncation(
  preview: OutlinePreview,
): string | null {
  if (!preview.truncated) return null;
  return `先頭の${formatCount(preview.shownCount)}件を表示しています（全${formatCount(preview.totalCount)}件）。`;
}

export function formatOutlineImportSuccess(count: number): string {
  return `${formatCount(count)}件のノードを追加しました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。`;
}

export function formatOutlineInsertFailure(
  reason: ForestInsertionFailureReason,
): string {
  switch (reason) {
    case "parent-missing":
      return `選択していたノードが見つからないため、追加できませんでした。「${OUTLINE_ROOT_TARGET_LABEL}」を選び直してください。`;
    case "invalid-items":
    case "placement-failed":
      return "ノードを追加できませんでした。マップは変わっていません。";
    default: {
      const unreachable: never = reason;
      throw new Error(
        `Unknown forest insertion failure: ${JSON.stringify(unreachable)}`,
      );
    }
  }
}
