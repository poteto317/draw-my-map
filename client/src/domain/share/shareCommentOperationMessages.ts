import {
  SHARE_COMMENT_MESSAGES,
  type ShareCommentMessageKey,
} from "@/domain/share/shareCommentMessages";

/** API reason → コメント操作の失敗文言のキー（プロバイダ・D1 の生エラーは出さない） */
const FAILURE_MESSAGE_BY_REASON: Readonly<Record<string, ShareCommentMessageKey>> = {
  unauthenticated: "failureUnauthenticated",
  "not-found": "failureNotFound",
  "thread-resolved": "failureThreadResolved",
  "comment-limit": "failureCommentLimit",
  "invalid-node": "failureInvalidNode",
  "invalid-comment": "failureInvalidComment",
  "rate-limited": "failureRateLimited",
};

export function shareCommentOperationFailureMessage(reason: string): string {
  return Object.hasOwn(FAILURE_MESSAGE_BY_REASON, reason)
    ? SHARE_COMMENT_MESSAGES[FAILURE_MESSAGE_BY_REASON[reason]]
    : SHARE_COMMENT_MESSAGES.operationFailed;
}
