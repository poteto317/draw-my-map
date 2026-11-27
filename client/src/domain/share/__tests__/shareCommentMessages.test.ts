import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";

describe("SHARE_COMMENT_MESSAGES", () => {
  it("主要な文言が正本どおり", () => {
    expect(SHARE_COMMENT_MESSAGES.title).toBe("コメント");
    expect(SHARE_COMMENT_MESSAGES.empty).toBe("まだコメントはありません。");
    expect(SHARE_COMMENT_MESSAGES.loadFailed).toBe("コメントを読み込めませんでした。");
    expect(SHARE_COMMENT_MESSAGES.nameVisibilityNotice).toBe(
      "名前（Google アカウントの名前）はこのリンクを知っている人に表示されます。",
    );
    expect(SHARE_COMMENT_MESSAGES.notSharedDisabled).toBe("共有中のマップだけコメントを使えます");
    expect(SHARE_COMMENT_MESSAGES.createSuccess).toBe("コメントを投稿しました。");
    expect(SHARE_COMMENT_MESSAGES.replySuccess).toBe("返信しました。");
    expect(SHARE_COMMENT_MESSAGES.resolveSuccess).toBe("解決しました。");
    expect(SHARE_COMMENT_MESSAGES.reopenSuccess).toBe("再開しました。");
    expect(SHARE_COMMENT_MESSAGES.deleteSuccess).toBe("削除しました。");
  });

  it("文言はすべて空でない文字列", () => {
    for (const value of Object.values(SHARE_COMMENT_MESSAGES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
