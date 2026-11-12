export type StorageEventListener = (event: StorageEvent) => void;

/**
 * window の "storage" イベントを安全に購読する。
 * SSR など window が存在しない環境では安全な noop 解除関数を返す。
 *
 * @param listener ストレージイベント受信時のコールバック
 * @returns 購読解除関数
 */
export function subscribeStorageEvent(listener: StorageEventListener): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener("storage", listener);
  };
}

/**
 * テスト用ヘルパー。
 * storage イベントを同期的に配信する。
 *
 * @param event 配信する StorageEvent
 */
export function emitStorageEventForTesting(event: StorageEvent): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(event);
  }
}
