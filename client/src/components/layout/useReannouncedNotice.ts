"use client";

import { useEffect, useState } from "react";

// 常設のライブリージョンに出す値。sequence が変わるたびに一度空（null）にし、次のフレームで入れ直す。
// 同じ文言が続いても DOM の中身が変わるので、同じノードのまま再び読み上げられる（L-153・L-166）
export function useReannouncedNotice<T>(sequence: number | null, value: T | null): T | null {
  const [shown, setShown] = useState<T | null>(null);

  useEffect(() => {
    setShown(null);
    if (value === null) return;
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
    // 同じ sequence の間は値を入れ直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence]);

  return shown;
}
