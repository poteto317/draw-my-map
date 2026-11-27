import { isRecord } from "@/domain/shared/unknownRecord";
import type { ShareSession } from "@/domain/share/shareSession";
import {
  collabRateKey,
  processCollabRateLimiter,
  type CollabRateLimiter,
} from "@/server/collab/collabRateLimit";
import { collabResultResponse } from "@/server/collab/collabResponses";
import {
  createUnimplementedCollabRoomClient,
  type CollabRoomClient,
} from "@/server/collab/collabRoomClient";
import { createCollabService, type CollabService } from "@/server/collab/collabService";
import { authorizeCollabServiceSecret } from "@/server/collab/collabServiceAuth";
import {
  createCloudflareCollabStore,
  type CollabStore,
} from "@/server/collab/collabStore";
import { readJsonBody, SHARE_MAX_BODY_BYTES } from "@/server/share/shareBody";
import {
  createCloudflareShareStore,
  type ShareStore,
} from "@/server/share/shareStore";
import type { D1Client } from "@/services/share/d1Client";
import type { R2Client } from "@/services/share/r2Client";

export type CollabApiDeps = {
  getSession: () => Promise<ShareSession>;
  d1: D1Client;
  r2: R2Client;
  tokenSecret: string;
  ticketSecret: string;
  /** env 正本の WS origin（x-forwarded-host 禁止） */
  wsOrigin: string;
  store?: CollabStore;
  shareStore?: ShareStore;
  room?: CollabRoomClient;
  service?: CollabService;
  rateLimiter?: CollabRateLimiter;
  maxBodyBytes?: number;
  nowIso?: () => string;
  nowMs?: () => number;
  createId?: () => string;
};

function resolveService(deps: CollabApiDeps): CollabService {
  if (deps.service) return deps.service;
  const store = deps.store ?? createCloudflareCollabStore(deps.d1, deps.r2);
  const shareStore = deps.shareStore ?? createCloudflareShareStore(deps.d1, deps.r2);
  return createCollabService({
    store,
    shareStore,
    room: deps.room ?? createUnimplementedCollabRoomClient(),
    tokenSecret: deps.tokenSecret,
    ticketSecret: deps.ticketSecret,
    wsOrigin: deps.wsOrigin,
    nowIso: deps.nowIso,
    nowMs: deps.nowMs,
    createId: deps.createId,
  });
}

function rateLimiter(deps: CollabApiDeps): CollabRateLimiter {
  // 未注入時もプロセス共有シングルトンを使い、リクエストごとの窓リセットを防ぐ
  return deps.rateLimiter ?? processCollabRateLimiter;
}

async function withRateLimit(
  deps: CollabApiDeps,
  session: ShareSession,
  run: () => Promise<Response>,
): Promise<Response> {
  if (!rateLimiter(deps).take(collabRateKey(session))) {
    return collabResultResponse({ ok: false, reason: "rate-limited" });
  }
  return run();
}

export async function handleCreateCollabSession(
  request: Request,
  deps: CollabApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withRateLimit(deps, session, async () => {
    const body = await readJsonBody(request, deps.maxBodyBytes ?? SHARE_MAX_BODY_BYTES);
    if (!body.ok) {
      // shareBody の応答にも no-store を付与
      const response = body.response;
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const record = isRecord(body.value) ? body.value : null;
    if (!record) {
      return collabResultResponse({ ok: false, reason: "invalid-request" });
    }
    const localMapId = record.localMapId;
    const documentJson = record.documentJson;
    const sharedMapId = record.sharedMapId;
    const seedFromArtifact = record.seedFromArtifact === true;
    if (typeof localMapId !== "string") {
      return collabResultResponse({ ok: false, reason: "invalid-request" });
    }
    if (!seedFromArtifact && typeof documentJson !== "string") {
      return collabResultResponse({ ok: false, reason: "invalid-request" });
    }
    if (sharedMapId !== undefined && typeof sharedMapId !== "string") {
      return collabResultResponse({ ok: false, reason: "invalid-request" });
    }
    const result = await resolveService(deps).startSession(session, {
      localMapId,
      sharedMapId,
      documentJson: typeof documentJson === "string" ? documentJson : "",
      seedFromArtifact,
    });
    return collabResultResponse(result);
  });
}

export async function handleCollabJoin(
  request: Request,
  deps: CollabApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withRateLimit(deps, session, async () => {
    const body = await readJsonBody(request, deps.maxBodyBytes ?? SHARE_MAX_BODY_BYTES);
    if (!body.ok) {
      const response = body.response;
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const record = isRecord(body.value) ? body.value : null;
    if (!record || typeof record.token !== "string") {
      return collabResultResponse({ ok: false, reason: "invalid-request" });
    }
    // token 平文はログに出さない（ハンドラ内で console しない）
    const result = await resolveService(deps).joinSession(session, {
      token: record.token,
    });
    return collabResultResponse(result);
  });
}

export async function handleEndCollabSession(
  _request: Request,
  sessionId: string,
  deps: CollabApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withRateLimit(deps, session, async () => {
    const result = await resolveService(deps).endSession(session, sessionId);
    return collabResultResponse(result);
  });
}

export async function handleLeaveCollabSession(
  _request: Request,
  sessionId: string,
  deps: CollabApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withRateLimit(deps, session, async () => {
    const result = await resolveService(deps).leaveSession(session, sessionId);
    return collabResultResponse(result);
  });
}

/**
 * Worker TTL 退避。Authorization: Bearer CF_COLLAB_SERVICE_SECRET。
 * ユーザーセッション不要。空 body は拒否。
 */
export async function handleCollabEvacuate(
  request: Request,
  deps: CollabApiDeps & { serviceSecret: string },
): Promise<Response> {
  if (!authorizeCollabServiceSecret(request.headers.get("Authorization"), deps.serviceSecret)) {
    return collabResultResponse({ ok: false, reason: "unauthenticated" });
  }
  const sessionId = request.headers.get("x-collab-session-id") ?? "";
  const body = new Uint8Array(await request.arrayBuffer());
  const result = await resolveService(deps).ingestEvacuate(sessionId, body);
  return collabResultResponse(result);
}

/**
 * Worker grace 脱落 → D1 参加者削除。Authorization: Bearer CF_COLLAB_SERVICE_SECRET。
 * Headers: x-collab-session-id, x-collab-user-id。
 */
export async function handleCollabDropParticipant(
  request: Request,
  deps: CollabApiDeps & { serviceSecret: string },
): Promise<Response> {
  if (!authorizeCollabServiceSecret(request.headers.get("Authorization"), deps.serviceSecret)) {
    return collabResultResponse({ ok: false, reason: "unauthenticated" });
  }
  const sessionId = request.headers.get("x-collab-session-id") ?? "";
  const userId = request.headers.get("x-collab-user-id") ?? "";
  const result = await resolveService(deps).dropParticipant(sessionId, userId);
  return collabResultResponse(result);
}

export async function handleGetCollabSession(
  _request: Request,
  sessionId: string,
  deps: CollabApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withRateLimit(deps, session, async () => {
    const result = await resolveService(deps).getSession(session, sessionId);
    return collabResultResponse(result);
  });
}

export async function handleReissueCollabTicket(
  _request: Request,
  sessionId: string,
  deps: CollabApiDeps,
): Promise<Response> {
  const session = await deps.getSession();
  return withRateLimit(deps, session, async () => {
    const result = await resolveService(deps).reissueTicket(session, sessionId);
    return collabResultResponse(result);
  });
}
