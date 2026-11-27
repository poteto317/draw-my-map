import {
  normalizeShareCommentAuthorName,
  SHARE_COMMENT_AUTHOR_NAME_FALLBACK,
} from "@/domain/share/normalizeShareCommentAuthorName";
import { SHARE_COMMENT_AUTHOR_NAME_MAX_CODE_POINTS } from "@/domain/share/shareCommentLimits";

describe("normalizeShareCommentAuthorName", () => {
  it("代替文言は「名前未設定」で上限は 50 コードポイント", () => {
    expect(SHARE_COMMENT_AUTHOR_NAME_FALLBACK).toBe("名前未設定");
    expect(SHARE_COMMENT_AUTHOR_NAME_MAX_CODE_POINTS).toBe(50);
  });

  it("C0（タブ・改行を含む）・U+007F・C1 を除く", () => {
    expect(
      normalizeShareCommentAuthorName("山\t田\n太\r郎\u0000\u007F\u0085\u009F"),
    ).toBe("山田太郎");
  });

  it("前後の空白を除く", () => {
    expect(normalizeShareCommentAuthorName("  Alice  ")).toBe("Alice");
  });

  it("50 コードポイントで切り、サロゲートペアを割らない", () => {
    expect(normalizeShareCommentAuthorName("a".repeat(60))).toBe("a".repeat(50));
    const emoji = "😀".repeat(60);
    const result = normalizeShareCommentAuthorName(emoji);
    expect(Array.from(result)).toHaveLength(50);
    expect(result).toBe("😀".repeat(50));
  });

  it("切った後の末尾空白も除く", () => {
    expect(normalizeShareCommentAuthorName(`${"a".repeat(49)} b`)).toBe("a".repeat(49));
  });

  it.each([null, "", "   ", "\n\t", "\u0000"])("%j は「名前未設定」", (name) => {
    expect(normalizeShareCommentAuthorName(name)).toBe(SHARE_COMMENT_AUTHOR_NAME_FALLBACK);
  });
});
