import { resolveShareCommentCapabilities } from "@/domain/share/shareCommentCapabilities";

const THREAD_CREATOR = "creator";
const COMMENT_AUTHOR = "author";

describe("resolveShareCommentCapabilities", () => {
  it.each([
    // [説明, viewerUserId, isOwner, commentAuthorUserId, canResolve, canDelete]
    ["所有者・コメントあり", "owner", true, COMMENT_AUTHOR, true, true],
    ["所有者・コメント null", "owner", true, null, true, false],
    ["スレッド作成者・自分のコメント", THREAD_CREATOR, false, THREAD_CREATOR, true, true],
    ["スレッド作成者・他人のコメント", THREAD_CREATOR, false, COMMENT_AUTHOR, true, false],
    ["スレッド作成者・コメント null", THREAD_CREATOR, false, null, true, false],
    ["投稿者（作成者でない）・自分のコメント", COMMENT_AUTHOR, false, COMMENT_AUTHOR, false, true],
    ["投稿者（作成者でない）・コメント null", COMMENT_AUTHOR, false, null, false, false],
    ["他人・コメントあり", "stranger", false, COMMENT_AUTHOR, false, false],
    ["他人・コメント null", "stranger", false, null, false, false],
    ["未ログイン・コメントあり", null, false, COMMENT_AUTHOR, false, false],
    ["未ログイン・コメント null", null, false, null, false, false],
  ] as const)(
    "%s",
    (_label, viewerUserId, isOwner, commentAuthorUserId, canResolve, canDelete) => {
      expect(
        resolveShareCommentCapabilities({
          viewerUserId,
          isOwner,
          threadCreatedByUserId: THREAD_CREATOR,
          commentAuthorUserId,
        }),
      ).toEqual({ canResolve, canDelete });
    },
  );
});
