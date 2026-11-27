import { SHARE_COMMENT_AUTHOR_NAME_MAX_CODE_POINTS } from "@/domain/share/shareCommentLimits";
import { sanitizeShareCommentSingleLine } from "@/domain/share/sanitizeShareCommentSingleLine";

export const SHARE_COMMENT_AUTHOR_NAME_FALLBACK = "名前未設定";

/** 投稿者・解決者の表示名（サーバーがセッションの name から作る） */
export function normalizeShareCommentAuthorName(name: string | null): string {
  return sanitizeShareCommentSingleLine(
    name ?? "",
    SHARE_COMMENT_AUTHOR_NAME_MAX_CODE_POINTS,
    SHARE_COMMENT_AUTHOR_NAME_FALLBACK,
  );
}
