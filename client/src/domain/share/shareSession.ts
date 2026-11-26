import type { ShareResult } from "@/domain/share/shareResult";

/** 共有操作の所有者。userId / email は非空が前提 */
export type ShareOwner = { userId: string; email: string };

/** useShareSession の ready 時の正本。null = 未ログイン */
export type ShareSession = ShareOwner | null;

function isBlank(value: string): boolean {
  return value.length === 0;
}

/**
 * Auth.js の user 断片を ShareSession に正規化する（純関数）。
 * id / email 欠落・空は未ログイン（null）。
 */
export function toShareSession(
  user: { id?: string | null; email?: string | null } | undefined | null,
): ShareSession {
  const userId = user?.id;
  const email = user?.email;
  if (typeof userId !== "string" || userId.length === 0) {
    return null;
  }
  if (typeof email !== "string" || email.length === 0) {
    return null;
  }
  return { userId, email };
}

/** 未ログイン・空の識別子は失敗。共有操作の成功扱いにしない（L-001） */
export function requireOwner(session: ShareSession): ShareResult<ShareOwner> {
  if (session === null || isBlank(session.userId) || isBlank(session.email)) {
    return { ok: false, reason: "unauthenticated" };
  }
  return { ok: true, value: session };
}
