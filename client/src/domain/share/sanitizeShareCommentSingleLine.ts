/** C0 すべて・U+007F・C1 */
const ALL_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/** 制御文字を除き、前後空白を除いてコードポイント数で切る（サロゲートペアを割らない） */
export function sanitizeShareCommentSingleLine(value: string, maxCodePoints: number, fallback: string): string {
  const stripped = value.replace(ALL_CONTROL_CHARS, "").trim();
  const truncated = Array.from(stripped).slice(0, maxCodePoints).join("").trim();
  return truncated.length === 0 ? fallback : truncated;
}
