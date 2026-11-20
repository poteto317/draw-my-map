/**
 * アウトライン表示切替・パレット restore 共通の初期フォーカス候補。
 * 優先: 選択行 → 先頭行 → ルート追加ボタン
 * 探索は data-*（表示文言・aria-label に依存しない）
 */
export function resolveOutlineInitialFocusTarget(
  doc: ParentNode = document,
): HTMLElement | null {
  const outlineRoot = doc.querySelector<HTMLElement>("[data-outline-root]");
  const selectedRow =
    outlineRoot?.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? null;
  const firstRow = outlineRoot?.querySelector<HTMLElement>("ol button") ?? null;
  const rootAdd =
    doc.querySelector<HTMLElement>("[data-outline-toolbar] button") ?? null;
  return selectedRow ?? firstRow ?? rootAdd;
}
