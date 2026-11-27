/** API reason → コメント操作の失敗文言（プロバイダ・D1 の生エラーは出さない） */
const FAILURE_MESSAGE_BY_REASON: Readonly<Record<string, string>> = {
  unauthenticated: "ログインが必要です。",
  "not-found": "コメントが見つかりません。削除されたか、リンクが無効になった可能性があります。",
  "thread-resolved": "解決済みのスレッドです。再開してから返信してください。",
  "comment-limit": "コメント数の上限に達しました。",
  "invalid-node": "公開中のマップにこのノードがありません。共有を更新してから投稿してください。",
  "invalid-comment": "コメントは 1〜2,000 文字で入力してください。",
  "rate-limited": "操作が多すぎます。しばらく待ってからやり直してください。",
};

const FALLBACK_FAILURE_MESSAGE = "コメントの操作に失敗しました。";

export function shareCommentOperationFailureMessage(reason: string): string {
  return Object.hasOwn(FAILURE_MESSAGE_BY_REASON, reason)
    ? FAILURE_MESSAGE_BY_REASON[reason]
    : FALLBACK_FAILURE_MESSAGE;
}
