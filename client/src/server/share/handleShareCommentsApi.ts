import { hasOnlyKeys } from "@/domain/shared/unknownRecord";
import type { ShareCommentsScope } from "@/domain/share/shareComment";
import { SHARE_COMMENT_MAX_BODY_BYTES } from "@/domain/share/shareCommentLimits";
import type { ShareResult } from "@/domain/share/shareResult";
import { tokenHash } from "@/domain/share/tokenHash";
import {
  asRecord,
  clientIpFromRequest,
  readJsonBody,
  withViewResponseHeaders,
  type ShareApiDeps,
} from "@/server/share/handleShareApi";
import {
  createShareCommentService,
  type CommentAccess,
  type ShareCommentService,
} from "@/server/share/shareCommentService";
import { createCloudflareShareCommentStore } from "@/server/share/shareCommentStore";
import {
  processShareCommentWriteRateLimiter,
  processShareOwnerRateLimiter,
  processShareViewRateLimiter,
} from "@/server/share/shareRateLimit";
import {
  SHARE_PRIVATE_NO_STORE,
  shareResultResponse,
} from "@/server/share/shareResponses";
import { createCloudflareShareStore } from "@/server/share/shareStore";

/** 作成で許すキー。表示名系（authorName / displayName など）は受け取らない（L-1032） */
const CREATE_THREAD_KEYS: ReadonlySet<string> = new Set(["nodeId", "body"]);
/** 返信で許すキー */
const REPLY_KEYS: ReadonlySet<string> = new Set(["body"]);

const RATE_LIMITED = { ok: false, reason: "rate-limited" } as const;
const INVALID_REQUEST = { ok: false, reason: "invalid-request" } as const;
const NOT_FOUND = { ok: false, reason: "not-found" } as const;
const UNAUTHENTICATED = { ok: false, reason: "unauthenticated" } as const;

function resolveCommentService(deps: ShareApiDeps): ShareCommentService {
  if (deps.commentService) return deps.commentService;
  return createShareCommentService({
    store: deps.store ?? createCloudflareShareStore(deps.d1, deps.r2),
    commentStore:
      deps.commentStore ?? createCloudflareShareCommentStore(deps.d1),
    tokenSecret: deps.tokenSecret,
    getSession: deps.getSession,
    getCommenter: deps.getCommenter,
    nowIso: deps.nowIso,
    createId: deps.createId,
  });
}

/** 応答ヘッダー: 成否とも他人のコメントを中間キャッシュに残さない。トークン経路は Referer も止める */
function withScopeHeaders(
  scope: ShareCommentsScope,
  response: Response,
): Response {
  if (scope.kind === "token") return withViewResponseHeaders(response);
  response.headers.set("Cache-Control", SHARE_PRIVATE_NO_STORE);
  return response;
}

function respond<T>(
  scope: ShareCommentsScope,
  result: ShareResult<T>,
): Response {
  return withScopeHeaders(scope, shareResultResponse(result));
}

/** 判定順 1: 経路のレート制限（トークン経路は閲覧と同じ枠、所有者経路は所有者 API と同じ枠） */
async function takeScopeRateLimit(
  request: Request,
  scope: ShareCommentsScope,
  deps: ShareApiDeps,
): Promise<boolean> {
  if (scope.kind === "token") {
    const limiter = deps.viewRateLimiter ?? processShareViewRateLimiter;
    if (!limiter.take(`view:ip:${clientIpFromRequest(request)}`)) return false;
    // 平文トークンをレートキーに載せない（keyed hash の非可逆キー）
    const rateKey =
      scope.token.length > 0
        ? tokenHash(scope.token, deps.tokenSecret)
        : "empty";
    return limiter.take(`view:${rateKey}`);
  }
  const session = await deps.getSession();
  const limiter = deps.ownerRateLimiter ?? processShareOwnerRateLimiter;
  return limiter.take(`owner:${session?.userId ?? "anonymous"}`);
}

/** 判定順 3: 書込みの枠。resolveAccess で 404 / 401 を確定した後にだけ取る */
function takeWriteRateLimit(
  request: Request,
  userId: string,
  deps: ShareApiDeps,
): boolean {
  const limiter =
    deps.commentWriteRateLimiter ?? processShareCommentWriteRateLimiter;
  if (!limiter.take(`comment-write:user:${userId}`)) return false;
  return limiter.take(`comment-write:ip:${clientIpFromRequest(request)}`);
}

/**
 * 判定順 1〜3 の共通部分。run は解決済みの access を受け取り、本文の検証（4）と操作（5）を行う。
 * run が Response を返すのは本文の読取で応答が確定したとき（413 / 400）。
 */
async function handleCommentRequest<T>(
  request: Request,
  scope: ShareCommentsScope,
  deps: ShareApiDeps,
  options: { write: boolean },
  run: (
    service: ShareCommentService,
    access: CommentAccess,
  ) => Promise<ShareResult<T> | Response>,
): Promise<Response> {
  if (!(await takeScopeRateLimit(request, scope, deps))) {
    return respond(scope, RATE_LIMITED);
  }
  const service = resolveCommentService(deps);
  const access = await service.resolveAccess(scope, {
    requireActor: options.write,
  });
  if (!access.ok) return respond(scope, access);
  if (options.write) {
    const actor = access.value.actor;
    // requireActor: true なら actor は必ずある。万一 null でも共有の枠で通さず閉じる
    if (actor === null) return respond(scope, UNAUTHENTICATED);
    if (!takeWriteRateLimit(request, actor.userId, deps))
      return respond(scope, RATE_LIMITED);
  }
  const outcome = await run(service, access.value);
  return outcome instanceof Response
    ? withScopeHeaders(scope, outcome)
    : respond(scope, outcome);
}

function isJsonContentType(request: Request): boolean {
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0];
  return mediaType.trim().toLowerCase() === "application/json";
}

/** 判定順 4: Content-Type → サイズ（413）→ JSON オブジェクト・許すキー（400） */
async function readCommentBody(
  request: Request,
  allowedKeys: ReadonlySet<string>,
): Promise<
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  if (!isJsonContentType(request)) {
    return { ok: false, response: shareResultResponse(INVALID_REQUEST) };
  }
  const body = await readJsonBody(request, SHARE_COMMENT_MAX_BODY_BYTES);
  if (!body.ok) return body;
  const record = asRecord(body.value);
  if (!record || !hasOnlyKeys(record, allowedKeys)) {
    return { ok: false, response: shareResultResponse(INVALID_REQUEST) };
  }
  return { ok: true, record };
}

/** 文字列の数字・0・小数・巨大値は拒否する（L-046） */
function isNodeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function handleListCommentThreads(
  request: Request,
  scope: ShareCommentsScope,
  deps: ShareApiDeps,
): Promise<Response> {
  return handleCommentRequest(
    request,
    scope,
    deps,
    { write: false },
    (service, access) => service.list(access),
  );
}

export function handleCreateCommentThread(
  request: Request,
  scope: ShareCommentsScope,
  deps: ShareApiDeps,
): Promise<Response> {
  return handleCommentRequest(
    request,
    scope,
    deps,
    { write: true },
    async (service, access) => {
      const body = await readCommentBody(request, CREATE_THREAD_KEYS);
      if (!body.ok) return body.response;
      // 必須キーの有無は型検査で見る（hasOnlyKeys は余計なキーだけを見る）。本文の正規化はサービス
      const { nodeId, body: text } = body.record;
      if (!isNodeId(nodeId) || typeof text !== "string") return INVALID_REQUEST;
      return service.createThread(access, { nodeId, body: text });
    },
  );
}

export function handleReplyCommentThread(
  request: Request,
  scope: ShareCommentsScope,
  threadId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  return handleCommentRequest(
    request,
    scope,
    deps,
    { write: true },
    async (service, access) => {
      const body = await readCommentBody(request, REPLY_KEYS);
      if (!body.ok) return body.response;
      const text = body.record.body;
      if (typeof text !== "string") return INVALID_REQUEST;
      if (threadId.length === 0) return NOT_FOUND;
      return service.reply(access, threadId, { body: text });
    },
  );
}

/** 本文を持たない書込み（解決・再開・削除）は本文も Content-Type も見ない */
export function handleResolveCommentThread(
  request: Request,
  scope: ShareCommentsScope,
  threadId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  return handleCommentRequest(
    request,
    scope,
    deps,
    { write: true },
    async (service, access) =>
      threadId.length === 0
        ? NOT_FOUND
        : service.resolveThread(access, threadId),
  );
}

export function handleReopenCommentThread(
  request: Request,
  scope: ShareCommentsScope,
  threadId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  return handleCommentRequest(
    request,
    scope,
    deps,
    { write: true },
    async (service, access) =>
      threadId.length === 0
        ? NOT_FOUND
        : service.reopenThread(access, threadId),
  );
}

export function handleDeleteComment(
  request: Request,
  scope: ShareCommentsScope,
  commentId: string,
  deps: ShareApiDeps,
): Promise<Response> {
  return handleCommentRequest(
    request,
    scope,
    deps,
    { write: true },
    async (service, access) =>
      commentId.length === 0
        ? NOT_FOUND
        : service.deleteComment(access, commentId),
  );
}
