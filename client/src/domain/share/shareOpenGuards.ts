import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

export type ShareOpenGuardInput = {
  readonly hasMapConflict: boolean;
  readonly isMapExternallyDeleted: boolean;
  readonly learningActive: boolean;
  readonly playingPresentation: boolean;
};

/** 共有ダイアログを開けない理由。競合と外部削除は同じ文言（conflictBlocked） */
export type ShareOpenBlockedReason =
  | "conflict"
  | "learning"
  | "presentation";

/** 競合・学習・プレゼン中は共有入口を塞ぐ（L-061） */
export function resolveShareOpenBlocked(
  input: ShareOpenGuardInput,
): ShareOpenBlockedReason | null {
  if (input.hasMapConflict || input.isMapExternallyDeleted) return "conflict";
  if (input.learningActive) return "learning";
  if (input.playingPresentation) return "presentation";
  return null;
}

export function shareOpenBlockedMessage(reason: ShareOpenBlockedReason): string {
  switch (reason) {
    case "conflict":
      return SHARE_MESSAGES.conflictBlocked;
    case "learning":
      return SHARE_MESSAGES.learnBlocked;
    case "presentation":
      return SHARE_MESSAGES.presentationBlocked;
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}
