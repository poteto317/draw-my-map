import type { CollabConnectionState } from "@/domain/collab/collabConnectionTypes";
import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";

export type ConnectionToSessionUiInput = {
  connection: CollabConnectionState;
  /** active / reconnecting で必須。closed→idle 時は無視 */
  sessionId: string;
  role: "owner" | "editor";
  /** reconnecting 開始時刻（ms）。reconnecting では必須 */
  reconnectingSince?: number;
  /** closed を異常閉鎖として error にするとき */
  closedAsError?: string;
};

/**
 * 接続層 → UI 状態の写像（inventory §1）。副作用なし。
 * `closed` → idle（正常）または error（異常）。`closed` を UI に出さない。
 * 時刻が必要な場合は呼び出し側が `reconnectingSince` を渡す（時計を注入しない）。
 */
export function connectionToSessionUi(input: ConnectionToSessionUiInput): CollabSessionUi {
  switch (input.connection) {
    case "connecting":
      return { status: "connecting" };
    case "active":
      return {
        status: "active",
        sessionId: input.sessionId,
        role: input.role,
      };
    case "reconnecting":
      return {
        status: "reconnecting",
        sessionId: input.sessionId,
        since: input.reconnectingSince ?? 0,
      };
    case "error":
      return { status: "error", error: input.closedAsError ?? "connection-error" };
    case "closed":
      if (input.closedAsError) {
        return { status: "error", error: input.closedAsError };
      }
      return { status: "idle" };
    default: {
      const _exhaustive: never = input.connection;
      return _exhaustive;
    }
  }
}
