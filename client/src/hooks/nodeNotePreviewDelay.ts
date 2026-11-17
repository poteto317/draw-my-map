// 入力が止まってからマップへ反映するまでの時間
export const NODE_NOTE_PREVIEW_DELAY_MS = 300;
// 入力が続いても、直前の反映（反映がまだ無ければフォーカス）の後の最初の入力からこの時間を超えて先送りしない（L-399）
export const NODE_NOTE_PREVIEW_MAX_WAIT_MS = 2000;

// 詳細メモの途中反映のタイマーの待ち時間。pendingSince は未反映の入力が始まった時刻、now は今の時刻（どちらも ms）。
// デバウンスの時間と、打ち切りまでの残りの短い方。打ち切りを過ぎていれば 0
export function getNodeNotePreviewDelay(pendingSince: number, now: number): number {
  const remaining = pendingSince + NODE_NOTE_PREVIEW_MAX_WAIT_MS - now;
  return Math.max(0, Math.min(NODE_NOTE_PREVIEW_DELAY_MS, remaining));
}
