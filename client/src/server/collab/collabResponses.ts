import type { ShareResult } from "@/domain/share/shareResult";

/** reason → HTTP。他者・不明・view トークンは 404（存在非漏洩） */
const STATUS_BY_REASON: Readonly<Record<string, number>> = {
  unauthenticated: 401,
  "not-found": 404,
  "no-active-session": 404,
  "invalid-request": 400,
  "invalid-document": 400,
  "id-collision": 400,
  "encode-error": 400,
  "decode-error": 502,
  "already-exists": 409,
  "too-large": 413,
  "rate-limited": 429,
  "connection-limit": 429,
  "not-configured": 503,
  "storage-error": 502,
  "seed-failed": 502,
  "export-failed": 502,
  "export-empty": 502,
  "destroy-failed": 502,
};

/** 認可付き Collab 応答。成否とも中間キャッシュに残さない（L-1232） */
export const COLLAB_PRIVATE_NO_STORE = "private, no-store";

export function collabResultResponse<T>(result: ShareResult<T>): Response {
  if (result.ok) {
    const response = Response.json(result, { status: 200 });
    response.headers.set("Cache-Control", COLLAB_PRIVATE_NO_STORE);
    return response;
  }
  const status = STATUS_BY_REASON[result.reason] ?? 400;
  const response = Response.json(result, { status });
  response.headers.set("Cache-Control", COLLAB_PRIVATE_NO_STORE);
  return response;
}
