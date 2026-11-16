// 一括置換・ノードの分割・ノードの統合のダイアログが共有する表示用の文言と整形

// 開いた後にマップが更新されたときの誤りの文言
export const STALE_DIALOG_MESSAGE = "マップが更新されました。閉じてから開き直してください。";

// プレビューに出すラベル。空文字や空白だけのラベルは空欄に見えるので、代わりの表示にする
export function formatPreviewLabel(label: string): string {
  if (label === "") return "（空）";
  if (label.trim() === "") return "（空白のみ）";
  return label;
}
