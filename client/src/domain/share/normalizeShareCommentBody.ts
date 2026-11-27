import {
  SHARE_COMMENT_BODY_MAX_LENGTH,
  SHARE_COMMENT_BODY_RAW_MAX_LENGTH,
} from "@/domain/share/shareCommentLimits";

export type ShareCommentBodyResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too-long" };

/** C0（タブ U+0009・改行 U+000A を除く）・U+007F・C1 */
const BODY_CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * コメント本文の正規化と長さ判定（クライアント・サーバー共用。L-836 / L-858）。
 * 上限は正規化後の値に掛け、超えたら切り詰めずに拒否する。
 */
export function normalizeShareCommentBody(raw: string): ShareCommentBodyResult {
  if (raw.length > SHARE_COMMENT_BODY_RAW_MAX_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  const value = raw
    .replace(/\r\n?/g, "\n")
    .replace(BODY_CONTROL_CHARS, "")
    .trim();
  if (value.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (value.length > SHARE_COMMENT_BODY_MAX_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, value };
}
