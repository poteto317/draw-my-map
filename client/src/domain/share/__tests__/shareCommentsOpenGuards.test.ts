import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import {
  commentsOpenBlockedMessage,
  resolveCommentsEntry,
  resolveCommentsOpenBlocked,
} from "@/domain/share/shareCommentsOpenGuards";

describe("resolveCommentsOpenBlocked", () => {
  it("どちらも偽なら null", () => {
    expect(resolveCommentsOpenBlocked({ learningActive: false, playingPresentation: false })).toBeNull();
  });

  it("学習中は learning", () => {
    expect(resolveCommentsOpenBlocked({ learningActive: true, playingPresentation: false })).toBe("learning");
  });

  it("再生中は presentation", () => {
    expect(resolveCommentsOpenBlocked({ learningActive: false, playingPresentation: true })).toBe("presentation");
  });

  it("両方なら学習を先に判定する", () => {
    expect(resolveCommentsOpenBlocked({ learningActive: true, playingPresentation: true })).toBe("learning");
  });
});

describe("commentsOpenBlockedMessage", () => {
  it("理由ごとの文言", () => {
    expect(commentsOpenBlockedMessage("learning")).toBe("学習モード中はコメントを開けません。");
    expect(commentsOpenBlockedMessage("presentation")).toBe("プレゼン再生中はコメントを開けません。");
  });
});

describe("resolveCommentsEntry", () => {
  it("共有中で塞ぐ理由が無ければ、どちらの理由も null", () => {
    expect(resolveCommentsEntry({ shared: true, learningActive: false, playingPresentation: false })).toEqual({
      blockedReason: null,
      controlDisabledReason: null,
    });
  });

  it("共有中の学習・再生はどちらの入口も同じ理由で塞ぐ", () => {
    expect(resolveCommentsEntry({ shared: true, learningActive: true, playingPresentation: false })).toEqual({
      blockedReason: "学習モード中はコメントを開けません。",
      controlDisabledReason: "学習モード中はコメントを開けません。",
    });
  });

  it("未共有はヘッダーの理由を未共有にする（学習・再生より先。設計 §7.2）", () => {
    expect(resolveCommentsEntry({ shared: false, learningActive: true, playingPresentation: true })).toEqual({
      blockedReason: "学習モード中はコメントを開けません。",
      controlDisabledReason: SHARE_COMMENT_MESSAGES.notSharedDisabled,
    });
  });

  it("未共有で塞ぐ理由が無ければ、右パネルの理由は null のまま", () => {
    expect(resolveCommentsEntry({ shared: false, learningActive: false, playingPresentation: false })).toEqual({
      blockedReason: null,
      controlDisabledReason: SHARE_COMMENT_MESSAGES.notSharedDisabled,
    });
  });
});
