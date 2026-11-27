import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { shareCommentOperationFailureMessage } from "@/domain/share/shareCommentOperationMessages";

describe("shareCommentOperationFailureMessage", () => {
  it.each([
    ["unauthenticated", "ログインが必要です。"],
    ["not-found", "コメントが見つかりません。削除されたか、リンクが無効になった可能性があります。"],
    ["thread-resolved", "解決済みのスレッドです。再開してから返信してください。"],
    ["comment-limit", "コメント数の上限に達しました。"],
    ["invalid-node", "公開中のマップにこのノードがありません。共有を更新してから投稿してください。"],
    ["invalid-comment", "コメントは 1〜2,000 文字で入力してください。"],
    ["rate-limited", "操作が多すぎます。しばらく待ってからやり直してください。"],
  ])("%s は固定文言", (reason, message) => {
    expect(shareCommentOperationFailureMessage(reason)).toBe(message);
  });

  it.each(["storage-error", "d1-query-failed", "not-configured", "", "SQLITE_ERROR: no such table"])(
    "未知の reason（%j）は汎用文言で、生の理由を出さない",
    (reason) => {
      expect(shareCommentOperationFailureMessage(reason)).toBe("コメントの操作に失敗しました。");
    },
  );

  it("失敗文言の正本は SHARE_COMMENT_MESSAGES（reason → キーの対応だけを持つ）", () => {
    expect(SHARE_COMMENT_MESSAGES).toMatchObject({
      failureUnauthenticated: "ログインが必要です。",
      failureNotFound: "コメントが見つかりません。削除されたか、リンクが無効になった可能性があります。",
      failureThreadResolved: "解決済みのスレッドです。再開してから返信してください。",
      failureCommentLimit: "コメント数の上限に達しました。",
      failureInvalidNode: "公開中のマップにこのノードがありません。共有を更新してから投稿してください。",
      failureInvalidComment: "コメントは 1〜2,000 文字で入力してください。",
      failureRateLimited: "操作が多すぎます。しばらく待ってからやり直してください。",
      operationFailed: "コメントの操作に失敗しました。",
    });
  });
});
