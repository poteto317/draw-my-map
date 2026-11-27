import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";

/** コメントを開けない理由（競合・保護では塞がない。コメントはローカル文書を書き換えない） */
export type CommentsOpenBlockedReason = "learning" | "presentation";

/** 学習中・プレゼン再生中はコメントの入口を塞ぐ（学習を先に判定） */
export function resolveCommentsOpenBlocked(input: {
  learningActive: boolean;
  playingPresentation: boolean;
}): CommentsOpenBlockedReason | null {
  if (input.learningActive) return "learning";
  if (input.playingPresentation) return "presentation";
  return null;
}

export function commentsOpenBlockedMessage(reason: CommentsOpenBlockedReason): string {
  switch (reason) {
    case "learning":
      return SHARE_COMMENT_MESSAGES.learnBlocked;
    case "presentation":
      return SHARE_COMMENT_MESSAGES.presentationBlocked;
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

export type CommentsEntryState = {
  /** 右パネルの入口を塞ぐ理由（学習・再生）。未共有では右パネルの入口そのものを出さない */
  blockedReason: string | null;
  /** ヘッダーの入口を塞ぐ理由。null なら開ける */
  controlDisabledReason: string | null;
};

/** 編集シェルのコメント入口（ヘッダー・右パネル）の塞ぎ方。未共有の判定を学習・再生より先に行う（設計 §7.2） */
export function resolveCommentsEntry(input: {
  shared: boolean;
  learningActive: boolean;
  playingPresentation: boolean;
}): CommentsEntryState {
  const blockedCode = resolveCommentsOpenBlocked(input);
  const blockedReason = blockedCode === null ? null : commentsOpenBlockedMessage(blockedCode);
  return {
    blockedReason,
    controlDisabledReason: input.shared ? blockedReason : SHARE_COMMENT_MESSAGES.notSharedDisabled,
  };
}
