import { EXCHANGE_MAX_ITEMS, EXCHANGE_MAX_TEXT_LENGTH } from "@/domain/exchange/exchangeLimits";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
import {
  formatOutlineImportSuccess,
  formatOutlineInsertFailure,
  OUTLINE_ROOT_TARGET_LABEL,
  OUTLINE_TOO_LONG_MESSAGE,
} from "@/domain/outline/outlineMessages";
import type { ForestInsertionFailureReason } from "@/domain/nodes/nodeForestInsertion";
import { forestDepthStats } from "@/domain/exchange/exchangePreview";

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export const EXCHANGE_OPML_LOSSY_NOTICE =
  "OPML では tags・links・座標・レイアウトなどは取り込まれません。label と note のみがマップに追加されます。";

export const EXCHANGE_ROOT_TARGET_LABEL = OUTLINE_ROOT_TARGET_LABEL;

export function formatExchangeDecodeError(reason: string): string {
  switch (reason) {
    case "empty":
      return "取り込める内容がありません。ファイルを選び直してください。";
    case "invalid-xml":
      return "OPML として読み取れません。XML の形式を確認してください。";
    case "missing-body":
      return "OPML に body がありません。ファイルを選び直してください。";
    case "missing-header":
      return "CSV/TSV の1行目に id, parentId, label, importance, note, tags のヘッダーが必要です。";
    case "unclosed-quote":
      return 'CSV/TSV の引用符（"）が閉じられていません。ファイルを確認してください。';
    case "too-long":
      return OUTLINE_TOO_LONG_MESSAGE;
    case "file-too-large":
      return `ファイルが大きすぎます（${formatCount(EXCHANGE_MAX_TEXT_LENGTH)}文字相当以内）。`;
    default:
      if (reason.startsWith("too-many-items:")) {
        const count = Number(reason.slice("too-many-items:".length));
        return `ノードが多すぎます（${formatCount(EXCHANGE_MAX_ITEMS)}件以内）。現在 ${formatCount(count)} 件です。`;
      }
      return reason.startsWith("行")
        ? `CSV/TSV を読み取れません。${reason}`
        : `ファイルを読み取れません。${reason}`;
  }
}

export function formatExchangePreviewSummary(items: readonly ForestItem[]): string {
  const { rootCount, maxDepth } = forestDepthStats(items);
  return `追加するノード: ${formatCount(items.length)}件（一番上の階層: ${formatCount(rootCount)}件、最も深い階層: ${formatCount(maxDepth + 1)}段目）`;
}

export function formatExchangeImportSuccess(count: number): string {
  return formatOutlineImportSuccess(count);
}

export function formatExchangeInsertFailure(reason: ForestInsertionFailureReason): string {
  return formatOutlineInsertFailure(reason);
}