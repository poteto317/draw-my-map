import type { ShareSession } from "@/domain/share/shareSession";
import { tokenHash } from "@/domain/share/tokenHash";

export type ShareRateLimiter = {
  /** true = 許可、false = 超過 */
  take(key: string): boolean;
  /** 期限切れ掃除後のバケット数（診断・テスト用） */
  size(): number;
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

  function gcExpired(t: number): void {
    for (const [key, bucket] of buckets) {
      if (t >= bucket.resetAt) buckets.delete(key);
    }
  }

  return {
    take(key) {
      const t = now();
      // allow / deny とも期限切れを掃除（ユニークキー増加でのメモリ枯渇を防ぐ）
      gcExpired(t);
      const current = buckets.get(key);
      if (!current) {
        buckets.set(key, { count: 1, resetAt: t + options.windowMs });
        return true;
      }
      if (current.count >= options.limit) return false;
      current.count += 1;
      return true;
    },
    size() {
      gcExpired(now());
      return buckets.size;
    },
  };
}

/** 所有者 API: ユーザーあたり 1 分 60 回 */
export const SHARE_OWNER_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

/** 閲覧 API: tokenHash / IP キーあたり 1 分 120 回 */
export const SHARE_VIEW_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;

/** コメント書込み: ユーザー / IP キーあたり 1 分 20 回（経路の枠に追加で掛ける） */
export const SHARE_COMMENT_WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

/**
 * 閲覧枠のキー。IP（または unknown 共有窓）を先に取り、回転トークンでの制限迂回とキー増殖を抑える。
 * 平文トークンはキーに載せない（keyed hash の非可逆キー）。空トークンは共有キー
 */
export function shareViewRateKeys(
  ip: string,
  token: string,
  secret: string,
): readonly [string, string] {
  const rateKey = token.length > 0 ? tokenHash(token, secret) : "empty";
  return [`view:ip:${ip}`, `view:${rateKey}`];
}

/** 所有者枠のキー。未ログインは共有キー */
export function shareOwnerRateKey(session: ShareSession): string {
  return `owner:${session?.userId ?? "anonymous"}`;
}

/**
 * プロセス共有の既定リミッタ。
 * リクエストごとに create すると窓がリセットされるため、本番 deps はこれを注入する。
 */
export const processShareOwnerRateLimiter = createShareRateLimiter(SHARE_OWNER_RATE_LIMIT);
export const processShareViewRateLimiter = createShareRateLimiter(SHARE_VIEW_RATE_LIMIT);
export const processShareCommentWriteRateLimiter = createShareRateLimiter(SHARE_COMMENT_WRITE_RATE_LIMIT);
