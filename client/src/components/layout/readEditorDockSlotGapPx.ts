/**
 * EditorDock スロット間 gap を px で読む。
 * CSS 変数 `--editor-dock-slot-gap` の計算値（px）を正とする。
 * jsdom や未解決の rem/em/% は 0（オーバーフロー判定を甘く＝全表示寄り）にする。
 */
export function readEditorDockSlotGapPx(
  container: Element,
  slotGapPx?: number,
): number {
  if (typeof slotGapPx === "number") {
    return Number.isFinite(slotGapPx) ? Math.max(0, slotGapPx) : 0;
  }
  try {
    if (typeof getComputedStyle !== "function") return 0;
    const style = getComputedStyle(container);
    const raw = (style.columnGap || style.gap || "0").trim();
    if (raw === "" || raw === "normal") return 0;
    // rem/em/% を parseFloat すると 0.5 のように「それっぽい px」になるため拒否する
    if (/(?:rem|em|%|vw|vh|ex|ch)$/i.test(raw)) return 0;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    return 0;
  }
}

/** jsdom は flex 幅が常に 0／モック汚染で誤 overflow しやすいので自動計測しない */
export function isDockOverflowAutoMeasureSupported(): boolean {
  if (typeof navigator === "undefined") return true;
  return !/jsdom/i.test(navigator.userAgent);
}
