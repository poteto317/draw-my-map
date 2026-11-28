/**
 * コンテナ幅に収まる primary スロット件数を算出する（純粋関数）。
 * 「その他」trigger を出す場合は overflowTriggerWidth と直前の gap を控除する。
 */
export function resolveDockOverflowPrimaryCount(input: {
  containerWidth: number;
  slotWidths: readonly number[];
  /** 「その他」trigger を出すときに primary から控除する幅 */
  overflowTriggerWidth?: number;
  /** スロット間（および trigger 直前）の CSS gap。未指定は 0 */
  slotGapPx?: number;
}): number {
  const { containerWidth, slotWidths } = input;
  const overflowTriggerWidth = input.overflowTriggerWidth ?? 0;
  const slotGapPx = Math.max(0, input.slotGapPx ?? 0);
  if (slotWidths.length === 0) return 0;
  // 未計測・ゼロ幅ではオーバーフロー判定せず全表示（jsdom / 初回レイアウト）
  if (containerWidth <= 0) return slotWidths.length;

  const totalWidths = slotWidths.reduce((sum, width) => sum + width, 0);
  const totalGaps = Math.max(0, slotWidths.length - 1) * slotGapPx;
  if (totalWidths + totalGaps <= containerWidth) return slotWidths.length;

  const gapBeforeTrigger =
    overflowTriggerWidth > 0 && slotWidths.length > 0 ? slotGapPx : 0;
  const available = Math.max(
    0,
    containerWidth - overflowTriggerWidth - gapBeforeTrigger,
  );
  let used = 0;
  let count = 0;
  for (const width of slotWidths) {
    const leadingGap = count > 0 ? slotGapPx : 0;
    if (used + leadingGap + width > available) break;
    used += leadingGap + width;
    count += 1;
  }
  return count;
}
