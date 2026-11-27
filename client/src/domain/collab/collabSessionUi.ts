/**
 * 共同編集 UI 状態（計画 Task 4 Interfaces）。
 * 接続層 CollabConnectionState との対応は inventory §1 / connectionToSessionUi。
 */
export type CollabParticipant = {
  userId: string;
  displayName: string;
  color: string;
};

export type CollabSessionUi =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "active"; sessionId: string; role: "owner" | "editor" }
  | { status: "reconnecting"; sessionId: string; since: number }
  | { status: "error"; error: string };

export type CollabParticipantsState = "loading" | "ready" | "error";

/** セッション中（idle 以外）か。タブ競合無効・保存拒否などの横断判定用 */
export function isCollabSessionBusy(session: CollabSessionUi): boolean {
  return session.status !== "idle";
}

/** マップ／アウトライン編集を受け付けるか（inventory §2.1） */
export function isCollabEditingAllowed(session: CollabSessionUi): boolean {
  return session.status === "active" || session.status === "idle";
}

/** タブ競合ガードを動かすか（idle のみ。設計 決めたこと 9） */
export function isCollabTabConflictGuardEnabled(session: CollabSessionUi): boolean {
  return session.status === "idle";
}
