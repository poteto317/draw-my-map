import type { ShareResult } from "@/domain/share/shareResult";

/** reason → HTTP。他者・不明は 404（存在非漏洩） */
const STATUS_BY_REASON: Readonly<Record<string, number>> = {
  unauthenticated: 401,
  "not-found": 404,
  "already-exists": 409,
  "invalid-request": 400,
  "invalid-document": 400,
  "invalid-permission": 400,
  "not-published": 400,
  "too-large": 413,
  "rate-limited": 429,
  "not-configured": 503,
  "storage-error": 502,
};

/** 閲覧 API 用。成功・404 とも中間キャッシュに載せない */
export const SHARE_VIEW_CACHE_CONTROL = "private, no-store";

/** 閲覧 API／ページ用。平文トークンを Referer に載せない */
export const SHARE_VIEW_REFERRER_POLICY = "no-referrer";

export function shareResultResponse<T>(result: ShareResult<T>): Response {
  if (result.ok) {
    return Response.json(result, { status: 200 });
  }
  const status = STATUS_BY_REASON[result.reason] ?? 400;
  return Response.json(result, { status });
}
