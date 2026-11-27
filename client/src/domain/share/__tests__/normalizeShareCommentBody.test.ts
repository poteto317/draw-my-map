import { normalizeShareCommentBody } from "@/domain/share/normalizeShareCommentBody";
import {
  SHARE_COMMENT_BODY_MAX_LENGTH,
  SHARE_COMMENT_BODY_RAW_MAX_LENGTH,
} from "@/domain/share/shareCommentLimits";

describe("normalizeShareCommentBody", () => {
  it("上限は本文 2,000・生入力 8,000", () => {
    expect(SHARE_COMMENT_BODY_MAX_LENGTH).toBe(2000);
    expect(SHARE_COMMENT_BODY_RAW_MAX_LENGTH).toBe(8000);
  });

  it("8,001 文字の生入力は正規化前に too-long", () => {
    expect(normalizeShareCommentBody("a".repeat(8001))).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("空白だけの 8,001 文字でも too-long（empty ではない）", () => {
    expect(normalizeShareCommentBody(" ".repeat(8001))).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("\\r\\n と \\r を \\n にそろえる", () => {
    expect(normalizeShareCommentBody("a\r\nb\rc")).toEqual({ ok: true, value: "a\nb\nc" });
  });

  it("制御文字を除き、タブと改行は残す", () => {
    const raw = "a\u0000b\u0007c\u001Bd\u007Fe\u0085f\u009Fg\th\ni";
    expect(normalizeShareCommentBody(raw)).toEqual({ ok: true, value: "abcdefg\th\ni" });
  });

  it("前後の空白・改行を除き、内側の改行は残す", () => {
    expect(normalizeShareCommentBody("  \n line1\n\nline2 \n\t ")).toEqual({
      ok: true,
      value: "line1\n\nline2",
    });
  });

  it.each(["", "   ", "\n\n", " \r\n\t "])("空白と改行だけ（%j）なら empty", (raw) => {
    expect(normalizeShareCommentBody(raw)).toEqual({ ok: false, reason: "empty" });
  });

  it("制御文字だけなら empty", () => {
    expect(normalizeShareCommentBody("\u0000\u0007")).toEqual({ ok: false, reason: "empty" });
  });

  it("正規化後ちょうど 2,000 は ok、2,001 は too-long", () => {
    expect(normalizeShareCommentBody("a".repeat(2000))).toEqual({
      ok: true,
      value: "a".repeat(2000),
    });
    expect(normalizeShareCommentBody("a".repeat(2001))).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("UTF-16 のコード単位で数える（絵文字は 2）", () => {
    const emoji = "😀".repeat(1000);
    expect(normalizeShareCommentBody(emoji)).toEqual({ ok: true, value: emoji });
    expect(normalizeShareCommentBody(`${emoji}a`)).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("前後空白を除いた結果で数える（正規化後に上限）", () => {
    const body = "a".repeat(2000);
    expect(normalizeShareCommentBody(`   ${body}\n\n  `)).toEqual({ ok: true, value: body });
  });

  it("\\r\\n の正規化で縮んだ結果で数える", () => {
    const raw = "a\r\n".repeat(1000).concat("b");
    const normalized = "a\n".repeat(1000).concat("b");
    expect(normalized.length).toBe(2001);
    expect(normalizeShareCommentBody(raw)).toEqual({ ok: false, reason: "too-long" });
    const shorter = "a\r\n".repeat(999).concat("a");
    expect(normalizeShareCommentBody(shorter)).toEqual({
      ok: true,
      value: "a\n".repeat(999).concat("a"),
    });
  });

  it("切り詰めない", () => {
    const result = normalizeShareCommentBody("x".repeat(2500));
    expect(result).toEqual({ ok: false, reason: "too-long" });
  });
});
