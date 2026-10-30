"use client";

import { useEffect } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";

export type UseSiblingReorderDragEscapeOptions = {
  isSiblingReorderActive: () => boolean;
  cancelActiveGesture: () => void;
};

// 中止しか行わないので、ダイアログを開いている間も働いてよい
export function useSiblingReorderDragEscape({
  isSiblingReorderActive,
  cancelActiveGesture,
}: UseSiblingReorderDragEscapeOptions): void {
  // window の登録をやり直さないよう、最新の options を ref から読む
  const latestOptionsRef = useLatestRef({ isSiblingReorderActive, cancelActiveGesture });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // IME の変換中の Escape は変換の取り消しに使う
      if (event.isComposing || event.keyCode === 229) return;
      const latest = latestOptionsRef.current;
      if (!latest.isSiblingReorderActive()) return;
      event.preventDefault();
      latest.cancelActiveGesture();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [latestOptionsRef]);
}
