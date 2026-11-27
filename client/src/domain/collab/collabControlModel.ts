import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";
import type { ShareSession } from "@/domain/share/shareSession";

/**
 * ヘッダー CollabControl の表示可否（inventory §2.2）。
 * UI コンポーネントから業務ルールを切り離す。
 */
export type CollabControlVisibility = {
  showStart: boolean;
  showRetry: boolean;
  showEnd: boolean;
  showLeave: boolean;
  startDisabled: boolean;
  showDroppedGraceHint: boolean;
};

export function resolveCollabControlVisibility(input: {
  collabSession: CollabSessionUi;
  shareSession: ShareSession;
  startDisabledReason?: string | null;
}): CollabControlVisibility {
  const { collabSession, shareSession, startDisabledReason = null } = input;
  const status = collabSession.status;

  return {
    showStart: status === "idle",
    showRetry: status === "error",
    showEnd: status === "active" && collabSession.role === "owner",
    showLeave:
      (status === "active" && collabSession.role === "editor")
      || status === "reconnecting"
      || status === "error",
    startDisabled: shareSession === null || startDisabledReason !== null,
    showDroppedGraceHint: status === "error" && collabSession.error === "dropped-grace",
  };
}

/** 接続状態の表示ラベル（固定文言） */
export function collabSessionStatusLabel(session: CollabSessionUi): string {
  switch (session.status) {
    case "idle":
      return COLLAB_MESSAGES.statusIdle;
    case "connecting":
      return COLLAB_MESSAGES.statusConnecting;
    case "active":
      return COLLAB_MESSAGES.statusActive;
    case "reconnecting":
      return COLLAB_MESSAGES.statusReconnecting;
    case "error":
      return COLLAB_MESSAGES.statusError;
    default: {
      const _never: never = session;
      return _never;
    }
  }
}
