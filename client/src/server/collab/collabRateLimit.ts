import type { ShareSession } from "@/domain/share/shareSession";
import {
  createShareRateLimiter,
  type ShareRateLimiter,
} from "@/server/share/shareRateLimit";

export type CollabRateLimiter = ShareRateLimiter;

export type CollabRateLimitOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

/** Collab API: ユーザーあたり 1 分 60 回 */
export const COLLAB_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

export function createCollabRateLimiter(
  options: CollabRateLimitOptions,
): CollabRateLimiter {
  return createShareRateLimiter(options);
}

/** 未ログインは共有キー。平文 token / ticket はキーに載せない */
export function collabRateKey(session: ShareSession): string {
  return `collab:${session?.userId ?? "anonymous"}`;
}

/**
 * プロセス共有の既定リミッタ（L-1230）。
 * リクエストごとに create すると窓がリセットされるため、本番 deps はこれを注入する。
 */
export const processCollabRateLimiter = createCollabRateLimiter(COLLAB_RATE_LIMIT);
