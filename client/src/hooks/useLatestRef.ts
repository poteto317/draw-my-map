import { useLayoutEffect, useRef } from "react";

// 描画のたびに最新の値を ref に写す。ref は常に同じオブジェクトなので、
// 長く生きるイベントハンドラや、登録をやり直したくない effect から最新の値を読める。
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  // 読み手は値の項目を読むだけで同一性を比較しないので、依存配列を付けず毎回写す
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
