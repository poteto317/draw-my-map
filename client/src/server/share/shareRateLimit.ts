export type ShareRateLimiter = {
  /** true = 許可、false = 超過 */
  take(key: string): boolean;
};

export type ShareRateLimitOptions = {
  /** 窓あたりの最大回数 */
  limit: number;
  /** 窓の長さ（ms） */
  windowMs: number;
  now?: () => number;
};

/** プロセス内固定窓。本番は単一インスタンス想定の最低限制御 */
export function createShareRateLimiter(options: ShareRateLimitOptions): ShareRateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const now = options.now ?? Date.now;

  return {
    take(key) {
      const t = now();
      const current = buckets.get(key);
      if (!current || t >= current.resetAt) {
        buckets.set(key, { count: 1, resetAt: t + options.windowMs });
        return true;
      }
      if (current.count >= options.limit) return false;
      current.count += 1;
      return true;
    },
  };
}

/** 所有者 API: ユーザーあたり 1 分 60 回 */
export const SHARE_OWNER_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

/** 閲覧 API: tokenHash キーあたり 1 分 120 回 */
export const SHARE_VIEW_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;

/**
 * プロセス共有の既定リミッタ。
 * リクエストごとに create すると窓がリセットされるため、本番 deps はこれを注入する。
 */
export const processShareOwnerRateLimiter = createShareRateLimiter(SHARE_OWNER_RATE_LIMIT);
export const processShareViewRateLimiter = createShareRateLimiter(SHARE_VIEW_RATE_LIMIT);
