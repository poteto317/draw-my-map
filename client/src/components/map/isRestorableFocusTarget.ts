/** パレット閉鎖後の restore-opener 候補として focus 可能か */
export function isRestorableFocusTarget(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.isConnected) return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  if (element instanceof HTMLInputElement && element.disabled) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  // getClientRects は jsdom で常に空になり得るため、明示的な非表示だけを見る
  const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return true;
}
