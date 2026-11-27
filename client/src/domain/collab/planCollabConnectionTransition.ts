import { connectionToSessionUi } from "@/domain/collab/connectionToSessionUi";
import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";
import type { CollabConnectionState } from "@/domain/collab/collabConnectionTypes";

export type PlanCollabConnectionTransitionInput = {
  connection: Exclude<CollabConnectionState, "closed">;
  sessionId: string;
  role: "owner" | "editor";
  /** 再接続 grace 計測中なら非 null */
  reconnectingSince: number | null;
  /** 現在時刻（ms）。時計関数ではなく値を渡す */
  nowMs: number;
};

/**
 * WS 接続状態変化 → UI セッション遷移の計画（副作用なし）。
 * reconnecting 中の connecting は grace UI を維持する。
 * `closed` は {@link nextCollabSessionAfterClosed}（functional setState 向け）。
 */
export type PlanCollabConnectionTransitionResult = {
  nextSession: CollabSessionUi;
  nextReconnectingSince: number | null;
  /** participants / presence を空にする */
  clearParticipantsAndPresence: boolean;
  /** Undo 可否フラグを落とす */
  clearUndoFlags: boolean;
  /** participantsState を loading にする */
  participantsLoading: boolean;
  /** active 突入時の awareness publish / 初期投影 */
  enterActive: boolean;
  /** connection-error notice を出す */
  publishConnectionError: boolean;
  /** runtime を破棄する（error） */
  tearDownRuntime: boolean;
};

export function planCollabConnectionTransition(
  input: PlanCollabConnectionTransitionInput,
): PlanCollabConnectionTransitionResult {
  const { connection, sessionId, role, nowMs } = input;
  let reconnectingSince = input.reconnectingSince;

  if (connection === "connecting") {
    // 再接続試行中は grace 計測のため reconnecting UI を維持する
    if (reconnectingSince !== null) {
      return {
        nextSession: {
          status: "reconnecting",
          sessionId,
          since: reconnectingSince,
        },
        nextReconnectingSince: reconnectingSince,
        clearParticipantsAndPresence: false,
        clearUndoFlags: true,
        participantsLoading: true,
        enterActive: false,
        publishConnectionError: false,
        tearDownRuntime: false,
      };
    }
    return {
      nextSession: connectionToSessionUi({ connection: "connecting", sessionId, role }),
      nextReconnectingSince: null,
      clearParticipantsAndPresence: false,
      clearUndoFlags: true,
      participantsLoading: true,
      enterActive: false,
      publishConnectionError: false,
      tearDownRuntime: false,
    };
  }

  if (connection === "active") {
    return {
      nextSession: connectionToSessionUi({ connection: "active", sessionId, role }),
      nextReconnectingSince: null,
      clearParticipantsAndPresence: false,
      clearUndoFlags: false,
      participantsLoading: true,
      enterActive: true,
      publishConnectionError: false,
      tearDownRuntime: false,
    };
  }

  if (connection === "reconnecting") {
    if (reconnectingSince === null) reconnectingSince = nowMs;
    return {
      nextSession: connectionToSessionUi({
        connection: "reconnecting",
        sessionId,
        role,
        reconnectingSince,
      }),
      nextReconnectingSince: reconnectingSince,
      clearParticipantsAndPresence: false,
      clearUndoFlags: false,
      participantsLoading: false,
      enterActive: false,
      publishConnectionError: false,
      tearDownRuntime: false,
    };
  }

  // connection === "error"
  return {
    nextSession: connectionToSessionUi({ connection: "error", sessionId, role }),
    nextReconnectingSince: null,
    clearParticipantsAndPresence: true,
    clearUndoFlags: true,
    participantsLoading: false,
    enterActive: false,
    publishConnectionError: true,
    tearDownRuntime: true,
  };
}

/**
 * intentional disconnect / tearDown 後の実 WS 非同期 close。
 * error（connection-error / dropped-grace）を idle で潰さない。
 * setState の updater 内で呼ぶこと。
 */
export function nextCollabSessionAfterClosed(previous: CollabSessionUi): CollabSessionUi {
  return previous.status === "error" ? previous : { status: "idle" };
}
