import { timingSafeEqual } from "node:crypto";

/**
 * Worker `requireServiceAuth` と同型の timing-safe Bearer 比較。
 * 長さ不一致は即 false（Worker と同じ）。
 */
export function authorizeCollabServiceSecret(
  authorizationHeader: string | null,
  serviceSecret: string,
): boolean {
  const provided = authorizationHeader ?? "";
  const expected = `Bearer ${serviceSecret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
