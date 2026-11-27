import { isRecord } from "@/domain/shared/unknownRecord";
import type { ShareCommenter, ShareSession } from "@/domain/share/shareSession";
import { readJsonBody, SHARE_MAX_BODY_BYTES } from "@/server/share/shareBody";
import type { ShareCommentService } from "@/server/share/shareCommentService";
import {
  createCloudflareShareCommentStore,
  type ShareCommentStore,
} from "@/server/share/shareCommentStore";
import {
  processShareOwnerRateLimiter,
  processShareViewRateLimiter,
  shareOwnerRateKey,
  shareViewRateKeys,
  type ShareRateLimiter,
} from "@/server/share/shareRateLimit";
import {
  shareResultResponse,
  withViewResponseHeaders,
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
  /** コメント投稿者（Google sub と名前）。表示名はクライアントから受け取らない */
  getCommenter: () => Promise<ShareCommenter | null>;
  d1: D1Client;
  r2: R2Client;
  tokenSecret: string;
  publicOrigin: string;
  /** テスト用。省略時は d1+r2 から生成 */
  store?: ShareStore;
  /** テスト用。省略時は d1 から生成 */
  commentStore?: ShareCommentStore;
  service?: ShareService;
  /** テスト用。省略時は store・commentStore から生成 */
  commentService?: ShareCommentService;
  ownerRateLimiter?: ShareRateLimiter;
  viewRateLimiter?: ShareRateLimiter;
  /** 省略時は processShareCommentWriteRateLimiter */
  commentWriteRateLimiter?: ShareRateLimiter;
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
    commentStore: deps.commentStore ?? createCloudflareShareCommentStore(deps.d1),
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

async function withOwnerRateLimit(
  deps: ShareApiDeps,
  session: ShareSession,
  run: () => Promise<Response>,
): Promise<Response> {
  if (!ownerLimiter(deps).take(shareOwnerRateKey(session))) {
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
    const record = isRecord(body.value) ? body.value : null;
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
    const record = isRecord(body.value) ? body.value : null;
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
    const record = isRecord(body.value) ? body.value : {};
    if ("expiresAt" in record || "expires_at" in record) {
      return shareResultResponse({ ok: false, reason: "invalid-request" });
    }
    const permission = record.permission;
    // 省略時は view 既定。文字列以外（配列・数値・null など）は変換せず拒否する
    if (permission !== undefined && typeof permission !== "string") {
      return shareResultResponse({ ok: false, reason: "invalid-permission" });
    }
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

export async function handleViewShare(
  request: Request,
  token: string,
  deps: ShareApiDeps,
): Promise<Response> {
  const limiter = viewLimiter(deps);
  const [ipKey, tokenKey] = shareViewRateKeys(
    clientIpFromRequest(request),
    token,
    deps.tokenSecret,
  );
  if (!limiter.take(ipKey)) {
    return withViewResponseHeaders(
      shareResultResponse({ ok: false, reason: "rate-limited" }),
    );
  }
  if (!limiter.take(tokenKey)) {
    return withViewResponseHeaders(
      shareResultResponse({ ok: false, reason: "rate-limited" }),
    );
  }
  const result = await resolveService(deps).viewByToken(token);
  return withViewResponseHeaders(shareResultResponse(result));
}
