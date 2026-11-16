import type { LabelReplaceRow } from "@/domain/search/nodeLabelReplace";
import { STALE_LABEL_REPLACE_MESSAGE } from "@/hooks/labelReplaceDialogState";

export const LABEL_REPLACE_PREVIEW_LIMIT = 200;

// emptied は常に残し、replace は先頭から上限件数まで残す。unchanged は出さない
export function selectLabelReplacePreviewRows(
  rows: readonly LabelReplaceRow[],
): { shown: readonly LabelReplaceRow[]; hiddenReplaceCount: number } {
  const shown: LabelReplaceRow[] = [];
  let replaceShown = 0;
  let hiddenReplaceCount = 0;
  for (const row of rows) {
    if (row.status === "unchanged") continue;
    if (row.status === "emptied") {
      shown.push(row);
    } else if (replaceShown < LABEL_REPLACE_PREVIEW_LIMIT) {
      shown.push(row);
      replaceShown += 1;
    } else {
      hiddenReplaceCount += 1;
    }
  }
  return { shown, hiddenReplaceCount };
}

// プレビューに出すラベル。空文字や空白だけのラベルは空欄に見えるので、代わりの表示にする
export function formatLabelReplacePreviewLabel(label: string): string {
  if (label === "") return "（空）";
  if (label.trim() === "") return "（空白のみ）";
  return label;
}

export type LabelReplaceStatusInput = {
  stale: boolean;
  query: string;
  // unchanged を除いた一致行の数（replace と emptied の合計）
  matchedRowCount: number;
  replaceCount: number;
  emptiedCount: number;
};

export function describeLabelReplaceStatus({
  stale,
  query,
  matchedRowCount,
  replaceCount,
  emptiedCount,
}: LabelReplaceStatusInput): string {
  if (stale) return STALE_LABEL_REPLACE_MESSAGE;
  if (query === "") return "検索語を入力してください。";
  if (matchedRowCount === 0) return "一致するノードがありません。";
  if (replaceCount === 0) return "置換できるノードがありません。";
  const emptied = emptiedCount > 0 ? `${emptiedCount}件は置換後に空になるため対象外です。` : "";
  return `${replaceCount}件を置換します。${emptied}`;
}
