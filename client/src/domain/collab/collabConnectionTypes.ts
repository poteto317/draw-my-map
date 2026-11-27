/** 接続層の状態（設計 § inventory / Task 3 Interfaces） */
export type CollabConnectionState =
  | "connecting"
  | "active"
  | "reconnecting"
  | "closed"
  | "error";

/** 切断後も枠を保持する猶予（設計: 2 分以内再接続） */
export const COLLAB_RECONNECT_GRACE_MS = 2 * 60 * 1000;
