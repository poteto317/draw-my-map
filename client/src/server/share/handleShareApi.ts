import { tokenHash } from "@/domain/share/tokenHash";
import type { ShareSession } from "@/domain/share/shareSession";
import {
  parseShareJson,
  readShareBodyWithinLimit,
  SHARE_MAX_BODY_BYTES,
} from "@/server/share/shareBody";
import {
  processShareOwnerRateLimiter,
  processShareViewRateLimiter,
  type ShareRateLimiter,
} from "@/server/share/shareRateLimit";
import {
  SHARE_VIEW_CACHE_CONTROL,
  SHARE_VIEW_REFERRER_POLICY,
  shareResultResponse,
} from "@/server/share/shareResponses";
import { createShareService, type ShareService } from "@/server/share/shareService";
import {
  createCloudflareShareStore,
  type ShareStore,
} from "@/server/share/shareStore";
import type { D1Client } from "@/services/share/d1Client";
import type { R2Client } from "@/services/share/r2Client";

export type ShareApiDeps = {
  getSession: () => Promise<ShareSession>;
  d1: D1Client;
  r2: R2Client;
  tokenSecret: string;
  publicOrigin: string;
  /** テスト用。省略時は d1+r2 から生成 */
  store?: ShareStore;
  service?: ShareService;
  ownerRateLimiter?: ShareRateLimiter;
  viewRateLimiter?: ShareRateLimiter;
  maxBodyBytes?: number;
  nowIso?: () => string;
  createId?: () => string;
  createToken?: () => string;
};

function resolveService(deps: ShareApiDeps): ShareService {
  if (deps.service) return deps.service;
  const store = deps.store ?? createCloudflareShareStore(deps.d1, deps.r2);
  return createShareService({
    store,
    tokenSecret: deps.tokenSecret,
    publicOrigin: deps.publicOrigin,
    nowIso: deps.nowIso,
    createId: deps.createId,
    createToken: deps.createToken,
  });
}

function ownerLimiter(deps: ShareApiDeps): ShareRateLimiter {
  // 未注入時もプロセス共有シングルトンを使い、リクエストごとの窓リセットを防ぐ
  return deps.ownerRateLimiter ?? processShareOwnerRateLimiter;
}

function viewLimiter(deps: ShareApiDeps): ShareRateLimiter {
  return deps.viewRateLimiter ?? processShareViewRateLimiter;
}

async function readJsonBody(
  request: Request,
  maxBodyBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const read = await readShareBodyWithinLimit(request, maxBodyBytes);
  if (read.kind === "too-large") {
    return { ok: false, response: shareResultResponse({ ok: false, reason: "too-large" }) };
  }
  if (read.kind === "error") {
    return { ok: false, response: shareResultResponse({ ok: false, reason: "invalid-request" }) };
  }
  const parsed = parseShareJson(read.text);
  if (parsed === undefined) {
    return { ok: false, response: shareResultResponse({ ok: false, reason: "invalid-request" }) };
  }
  return { ok: true, value: parsed };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function withOwnerRateLimit(
  deps: ShareApiDeps,
  session: ShareSession,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = session?.userId ?? "anonymous";
  if (!ownerLimiter(deps).take(`owner:${key}`)) {
    return shareResultResponse({ ok: false, reason: "rate-limited" });
  }
  return run();
}

export async function handleListShareMaps(
  _request: Request,
  deps: ShareApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withOwnerRateLimit(deps, session, async () => {
    const result = await resolveService(deps).listMaps(session);
    return shareResultResponse(result);
  });
}

export async function handleCreateShareMap(
  request: Request,
  deps: ShareApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withOwnerRateLimit(deps, session, async () => {
    const body = await readJsonBody(request, deps.maxBodyBytes ?? SHARE_MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const record = asRecord(body.value);
    if (!record) {
      return shareResultResponse({ ok: false, reason: "invalid-request" });
    }
    // expires_at は Phase 37 で設定不可
    if ("expiresAt" in record || "expires_at" in record) {
      return shareResultResponse({ ok: false, reason: "invalid-request" });
    }
    const localMapId = record.localMapId;
    const title = record.title;
    const documentJson = record.documentJson;
    if (
      typeof localMapId !== "string" ||
      typeof title !== "string" ||
      typeof documentJson !== "string"
    ) {
      return shareResultResponse({ ok: false, reason: "invalid-request" });
    }
    const result = await resolveService(deps).createShare(session, {
      localMapId,
      title,
      documentJson,
    });
    return shareResultResponse(result);
  });
}

export async function handlePublishShareMap(
  request: Request,
  mapId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withOwnerRateLimit(deps, session, async () => {
    const body = await readJsonBody(request, deps.maxBodyBytes ?? SHARE_MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const record = asRecord(body.value);
    if (!record || typeof record.documentJson !== "string") {
      return shareResultResponse({ ok: false, reason: "invalid-request" });
    }
    const result = await resolveService(deps).publish(session, mapId, {
      documentJson: record.documentJson,
    });
    return shareResultResponse(result);
  });
}

export async function handleCreateShareLink(
  request: Request,
  mapId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withOwnerRateLimit(deps, session, async () => {
    const body = await readJsonBody(request, deps.maxBodyBytes ?? SHARE_MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const record = asRecord(body.value) ?? {};
    if ("expiresAt" in record || "expires_at" in record) {
      return shareResultResponse({ ok: false, reason: "invalid-request" });
    }
    const permission =
      record.permission === undefined ? undefined : String(record.permission);
    const result = await resolveService(deps).createLink(session, mapId, { permission });
    return shareResultResponse(result);
  });
}

export async function handleRevokeShareLink(
  _request: Request,
  linkId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withOwnerRateLimit(deps, session, async () => {
    const result = await resolveService(deps).revokeLink(session, linkId);
    return shareResultResponse(result);
  });
}

export async function handleReissueShareLink(
  _request: Request,
  linkId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withOwnerRateLimit(deps, session, async () => {
    const result = await resolveService(deps).reissueLink(session, linkId);
    return shareResultResponse(result);
  });
}

export async function handleDeleteShareMap(
  _request: Request,
  mapId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withOwnerRateLimit(deps, session, async () => {
    const result = await resolveService(deps).deleteShare(session, mapId);
    return shareResultResponse(result);
  });
}

/** クライアント識別（CF / 転送ヘッダ）。無いときは unknown で共有窓 */
export function clientIpFromRequest(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

function withViewResponseHeaders(response: Response): Response {
  // トークン付き閲覧は成否ともキャッシュさせない（失効後の CDN 残存を防ぐ）
  response.headers.set("Cache-Control", SHARE_VIEW_CACHE_CONTROL);
  // 平文トークンを Referer 経由で外部・ログへ出さない
  response.headers.set("Referrer-Policy", SHARE_VIEW_REFERRER_POLICY);
  return response;
}

export async function handleViewShare(
  request: Request,
  token: string,
  deps: ShareApiDeps,
): Promise<Response> {
  const limiter = viewLimiter(deps);
  // IP（または unknown 共有窓）を先に取り、回転トークンでの制限迂回とキー増殖を抑える
  const ip = clientIpFromRequest(request);
  if (!limiter.take(`view:ip:${ip}`)) {
    return withViewResponseHeaders(
      shareResultResponse({ ok: false, reason: "rate-limited" }),
    );
  }
  // 平文トークンをレートキーに載せない（keyed hash の非可逆キー）
  const rateKey =
    token.length > 0 ? tokenHash(token, deps.tokenSecret) : "empty";
  if (!limiter.take(`view:${rateKey}`)) {
    return withViewResponseHeaders(
      shareResultResponse({ ok: false, reason: "rate-limited" }),
    );
  }
  const result = await resolveService(deps).viewByToken(token);
  return withViewResponseHeaders(shareResultResponse(result));
}
