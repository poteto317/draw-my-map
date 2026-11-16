"use client";

import { useLayoutEffect, type RefObject } from "react";

type UseHeaderFocusReturnOptions = {
  // "header" のとき、ヘッダーのボタンへフォーカスを戻す。ほかの値・null では何もしない
  focusRequest: string | null;
  consumeFocusRequest: () => void;
  // ダイアログを開いたヘッダーのボタン
  buttonRef: RefObject<HTMLButtonElement | null>;
  // ボタンが無効・存在しないときの戻り先（常に押せるボタン）
  fallbackRef: RefObject<HTMLButtonElement | null>;
};

// ダイアログを閉じた描画の後に、ヘッダーのボタンへフォーカスを戻す（閉じる描画で根の inert が外れた後に当てる。L-155）。
// 確定でボタンが無効になったとき（統合の成功後など）は、常に押せるボタンへ送る
export function useHeaderFocusReturn({
  focusRequest,
  consumeFocusRequest,
  buttonRef,
  fallbackRef,
}: UseHeaderFocusReturnOptions): void {
  useLayoutEffect(() => {
    if (focusRequest !== "header") return;
    const button = buttonRef.current;
    const target = button === null || button.disabled ? fallbackRef.current : button;
    target?.focus();
    consumeFocusRequest();
  }, [focusRequest, consumeFocusRequest, buttonRef, fallbackRef]);
}
