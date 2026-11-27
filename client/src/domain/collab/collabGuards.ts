import {
  isCollabEditingAllowed,
  isCollabSessionBusy,
  type CollabSessionUi,
} from "@/domain/collab/collabSessionUi";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";

/** inventory §2 / §2.3 の入口 ID（共同編集が塞ぐもの） */
export type CollabBlockedEntry =
  | "save"
  | "learn"
  | "presentation"
  | "voice"
  | "comments"
  | "protect"
  | "mapSwitch"
  | "outlineImport"
  | "shareDialogOpen"
  | "publish"
  | "outlineExport"
  /** P36-E5 JSON 読込（全文置換） */
  | "jsonImport"
  /** P36-AI-N / AI-A */
  | "aiAssist"
  /** P36-一括（ラベル一括・分割統合など） */
  | "bulkEdit";

export type CollabStartGuardInput = {
  shareSession: { userId: string } | null;
  isProtectedMode: boolean;
  learningActive: boolean;
  playingPresentation: boolean;
  voiceListening: boolean;
  hasMapConflict: boolean;
  isMapExternallyDeleted: boolean;
  collabSession: CollabSessionUi;
};

export type CollabStartBlockedReason =
  | "unauthenticated"
  | "protected"
  | "learning"
  | "presentation"
  | "voice"
  | "conflict"
  | "busy";

/** 所有者の「共同編集を開始」拒否理由（inventory §2.2） */
export function resolveCollabStartBlocked(
  input: CollabStartGuardInput,
): CollabStartBlockedReason | null {
  if (input.shareSession === null) return "unauthenticated";
  if (input.isProtectedMode) return "protected";
  if (input.learningActive) return "learning";
  if (input.playingPresentation) return "presentation";
  if (input.voiceListening) return "voice";
  if (input.hasMapConflict || input.isMapExternallyDeleted) return "conflict";
  if (input.collabSession.status === "connecting") return "busy";
  if (input.collabSession.status === "active") return "busy";
  if (input.collabSession.status === "reconnecting") return "busy";
  return null;
}

export function collabStartBlockedMessage(reason: CollabStartBlockedReason): string {
  switch (reason) {
    case "unauthenticated":
      return COLLAB_MESSAGES.startUnauthenticated;
    case "protected":
      return COLLAB_MESSAGES.startBlockedProtected;
    case "learning":
      return COLLAB_MESSAGES.startBlockedLearning;
    case "presentation":
      return COLLAB_MESSAGES.startBlockedPresentation;
    case "voice":
      return COLLAB_MESSAGES.startBlockedVoice;
    case "conflict":
      return COLLAB_MESSAGES.startBlockedConflict;
    case "busy":
      return COLLAB_MESSAGES.blockedWhileConnecting;
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}

/**
 * 既存入口が共同編集 UI 状態で拒否されるか（inventory §2）。
 * 戻り値が非 null なら実行しない（拒否）。
 */
export function resolveCollabEntryBlocked(
  entry: CollabBlockedEntry,
  session: CollabSessionUi,
): string | null {
  const status = session.status;

  // E6 share dialog: reconnecting のみ拒否。active 中はダイアログ可・publish は別
  if (entry === "shareDialogOpen") {
    if (status === "reconnecting") return COLLAB_MESSAGES.blockedWhileReconnecting;
    return null;
  }
  if (entry === "publish") {
    if (status === "active" || status === "connecting" || status === "reconnecting") {
      return COLLAB_MESSAGES.blockedByCollab;
    }
    return null;
  }
  // E11 outline export: reconnecting のみ拒否、active は可
  if (entry === "outlineExport") {
    if (status === "reconnecting") return COLLAB_MESSAGES.blockedWhileReconnecting;
    if (status === "connecting") return COLLAB_MESSAGES.blockedWhileConnecting;
    return null;
  }

  // E1, E3–E5, E7–E10: idle 以外は拒否
  if (!isCollabSessionBusy(session)) return null;
  if (status === "connecting") return COLLAB_MESSAGES.blockedWhileConnecting;
  if (status === "reconnecting") return COLLAB_MESSAGES.blockedWhileReconnecting;
  return COLLAB_MESSAGES.blockedByCollab;
}

/** 入力ブロック（マップ／アウトライン）。キューしない */
export function resolveCollabInputBlocked(session: CollabSessionUi): string | null {
  if (isCollabEditingAllowed(session)) return null;
  if (session.status === "connecting") return COLLAB_MESSAGES.blockedWhileConnecting;
  if (session.status === "reconnecting") return COLLAB_MESSAGES.blockedWhileReconnecting;
  if (session.status === "error") return COLLAB_MESSAGES.statusError;
  return COLLAB_MESSAGES.blockedByCollab;
}
