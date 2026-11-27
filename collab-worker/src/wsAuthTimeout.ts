/** accept 後、ticket 認証までの上限（指摘: 未認証 WS の DoS 防止） */
export const COLLAB_WS_AUTH_TIMEOUT_MS = 5_000;

export type WsAuthTimeoutSocket = {
  close: (code?: number, reason?: string) => void;
};

/**
 * 未認証のまま timeoutMs 経過したら close(4401)。
 * 認証済みなら何もしない。返した clear でキャンセル可。
 */
export function armWsAuthTimeout(
  socket: WsAuthTimeoutSocket,
  isAuthed: () => boolean,
  timeoutMs: number = COLLAB_WS_AUTH_TIMEOUT_MS,
  schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  clear: (id: ReturnType<typeof setTimeout>) => void = clearTimeout,
): () => void {
  const id = schedule(() => {
    if (isAuthed()) return;
    try {
      socket.close(4401, "unauthorized");
    } catch {
      /* ignore */
    }
  }, timeoutMs);
  return () => clear(id);
}
