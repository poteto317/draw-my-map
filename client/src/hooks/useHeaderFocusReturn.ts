"use client";

import { useLayoutEffect, type RefObject } from "react";

type UseHeaderFocusReturnOptions = {
  // "header" のとき、ヘッダーのボタンへフォーカスを戻す。ほかの値・null では何もしない
  focusRequest: string | null;
  consumeFocusRequest: () => void;
  // ダイアログを開いたヘッダーのボタン
  buttonRef: RefObject<HTMLButtonElement | null>;
  // ボタンが無効・存在しないときの戻り先（先頭から順に、描画されていて有効な最初のボタンへ送る）。
  // 最後には常に押せるボタンを置く。途中は、押されても無害なボタンを置く
  fallbackRefs: readonly RefObject<HTMLButtonElement | null>[];
};

// ダイアログを閉じた描画の後に、ヘッダーのボタンへフォーカスを戻す（閉じる描画で根の inert が外れた後に当てる。L-155）。
// 確定でボタンが無効になったとき（統合の成功後など）は、戻り先のボタンを順にたどって、有効な最初のボタンへ送る。
// すべて無効なら、フォーカスは動かさない
export function useHeaderFocusReturn({
  focusRequest,
  consumeFocusRequest,
  buttonRef,
  fallbackRefs,
}: UseHeaderFocusReturnOptions): void {
  useLayoutEffect(() => {
    if (focusRequest !== "header") return;
    const candidates = [buttonRef.current, ...fallbackRefs.map((ref) => ref.current)];
    candidates.find((candidate) => candidate !== null && !candidate.disabled)?.focus();
    consumeFocusRequest();
  }, [focusRequest, consumeFocusRequest, buttonRef, fallbackRefs]);
}
