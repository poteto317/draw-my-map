import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentsScope,
  ShareCommentThreadView,
  ShareCommentView,
} from "@/domain/share/shareComment";
import { resolveShareCommentCapabilities } from "@/domain/share/shareCommentCapabilities";
import { linkPermissionAllowsComments } from "@/domain/share/shareLinkPermission";
import { normalizeShareCommentBody } from "@/domain/share/normalizeShareCommentBody";
import { normalizeShareCommentAuthorName } from "@/domain/share/normalizeShareCommentAuthorName";
import { normalizeShareCommentNodeLabel } from "@/domain/share/normalizeShareCommentNodeLabel";
import type { ShareResult } from "@/domain/share/shareResult";
import { requireCommenter, type ShareCommenter, type ShareSession } from "@/domain/share/shareSession";
import { loadCurrentShareDocument } from "@/server/share/loadCurrentShareDocument";
import { resolveShareLinkByToken } from "@/server/share/resolveShareLinkByToken";
import type {
  ShareCommentRecord,
  ShareCommentStore,
  ShareCommentThreadRecord,
} from "@/server/share/shareCommentStore";
import { requireOwnedMap } from "@/server/share/shareService";
import type { SharedMapRecord, ShareStore } from "@/server/share/shareStore";

/** 解決済みの主体。操作関数はこれだけを受け取り、トークンやセッションを読み直さない */
export type CommentAccess = {
  readonly map: SharedMapRecord;
  /** null = 未ログイン（トークン経路の一覧だけで起こりうる）。displayName は正規化済み */
  readonly actor: {
    readonly userId: string;
    readonly displayName: string;
  } | null;
  readonly isOwner: boolean;
  readonly via: "token" | "owner";
};

export type ShareCommentServiceDeps = {
  store: ShareStore;
  commentStore: ShareCommentStore;
  tokenSecret: string;
  getSession: () => Promise<ShareSession>;
  getCommenter: () => Promise<ShareCommenter | null>;
  nowIso?: () => string;
  createId?: () => string;
};

export type ShareCommentService = {
  /** 404 / 401 をここで確定する。requireActor=true なら未ログインは unauthenticated */
  resolveAccess(
    scope: ShareCommentsScope,
    options: { requireActor: boolean },
  ): Promise<ShareResult<CommentAccess>>;
  list(access: CommentAccess): Promise<ShareResult<ShareCommentListValue>>;
  createThread(
    access: CommentAccess,
    input: { nodeId: number; body: string },
  ): Promise<ShareResult<ShareCommentThreadView>>;
  reply(
    access: CommentAccess,
    threadId: string,
    input: { body: string },
  ): Promise<ShareResult<ShareCommentThreadView>>;
  resolveThread(
    access: CommentAccess,
    threadId: string,
  ): Promise<ShareResult<ShareCommentThreadView>>;
  reopenThread(
    access: CommentAccess,
    threadId: string,
  ): Promise<ShareResult<ShareCommentThreadView>>;
  deleteComment(
    access: CommentAccess,
    commentId: string,
  ): Promise<ShareResult<ShareCommentDeleteValue>>;
};

type Actor = NonNullable<CommentAccess["actor"]>;

const NOT_FOUND = { ok: false, reason: "not-found" } as const;
const UNAUTHENTICATED = { ok: false, reason: "unauthenticated" } as const;
const STORAGE_ERROR = { ok: false, reason: "storage-error" } as const;
const COMMENT_LIMIT = { ok: false, reason: "comment-limit" } as const;
const INVALID_COMMENT = { ok: false, reason: "invalid-comment" } as const;

function toActor(commenter: ShareCommenter | null): CommentAccess["actor"] {
  if (commenter === null) return null;
  return {
    userId: commenter.userId,
    displayName: normalizeShareCommentAuthorName(commenter.displayName),
  };
}

/** ストアの例外を storage-error に揃える（生メッセージは外へ出さない） */
async function guardStorage<T>(
  run: () => Promise<ShareResult<T>>,
): Promise<ShareResult<T>> {
  try {
    return await run();
  } catch {
    return STORAGE_ERROR;
  }
}

function viewerUserId(access: CommentAccess): string | null {
  return access.actor?.userId ?? null;
}

function threadCapabilities(
  access: CommentAccess,
  thread: ShareCommentThreadRecord,
) {
  return resolveShareCommentCapabilities({
    viewerUserId: viewerUserId(access),
    isOwner: access.isOwner,
    threadCreatedByUserId: thread.createdByUserId,
    commentAuthorUserId: null,
  });
}

function toCommentView(
  access: CommentAccess,
  thread: ShareCommentThreadRecord,
  comment: ShareCommentRecord,
): ShareCommentView {
  const { canDelete } = resolveShareCommentCapabilities({
    viewerUserId: viewerUserId(access),
    isOwner: access.isOwner,
    threadCreatedByUserId: thread.createdByUserId,
    commentAuthorUserId: comment.authorUserId,
  });
  return {
    id: comment.id,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    canDelete,
  };
}

/** 応答の View。userId 系の列は写さない（L-1032） */
function toThreadView(
  access: CommentAccess,
  thread: ShareCommentThreadRecord,
  comments: readonly ShareCommentRecord[],
): ShareCommentThreadView {
  return {
    id: thread.id,
    nodeId: thread.nodeId,
    nodeLabelSnapshot: thread.nodeLabelSnapshot,
    status: thread.status,
    resolvedByName: thread.resolvedByName,
    resolvedAt: thread.resolvedAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    canResolve: threadCapabilities(access, thread).canResolve,
    comments: comments.map((comment) => toCommentView(access, thread, comment)),
  };
}

export function createShareCommentService(
  deps: ShareCommentServiceDeps,
): ShareCommentService {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const createId = deps.createId ?? (() => crypto.randomUUID());
  const { store, commentStore, tokenSecret, getSession, getCommenter } = deps;

  async function resolveTokenAccess(
    token: string,
    requireActor: boolean,
  ): Promise<ShareResult<CommentAccess>> {
    const resolved = await resolveShareLinkByToken(store, token, tokenSecret);
    if (!resolved.ok) return resolved;
    // view リンクは所有者の判定まで進めない（リンクの種類も主体も漏らさない）
    if (!linkPermissionAllowsComments(resolved.value.permission))
      return NOT_FOUND;
    const commenter = await getCommenter();
    if (requireActor) {
      const required = requireCommenter(commenter);
      if (!required.ok) return required;
    }
    const map = resolved.value.map;
    return {
      ok: true,
      value: {
        map,
        actor: toActor(commenter),
        isOwner: commenter !== null && commenter.userId === map.ownerUserId,
        via: "token",
      },
    };
  }

  async function resolveOwnerAccess(
    sharedMapId: string,
  ): Promise<ShareResult<CommentAccess>> {
    const session = await getSession();
    const owned = await requireOwnedMap(store, session, sharedMapId);
    if (!owned.ok) return owned;
    const commenter = await getCommenter();
    // 同じ auth() 由来の 2 値が食い違うときは主体を確定できない（§4.1）
    if (
      commenter === null ||
      session === null ||
      commenter.userId !== session.userId
    ) {
      return UNAUTHENTICATED;
    }
    return {
      ok: true,
      value: {
        map: owned.value,
        actor: toActor(commenter),
        isOwner: true,
        via: "owner",
      },
    };
  }

  /** 書込み後の確定値を読み直す。消えていれば not-found */
  async function reloadThreadView(
    access: CommentAccess,
    threadId: string,
  ): Promise<ShareResult<ShareCommentThreadView>> {
    const thread = await commentStore.getThread(access.map.id, threadId);
    if (!thread) return NOT_FOUND;
    const comments = await commentStore.listCommentsByThread(
      access.map.id,
      threadId,
    );
    return { ok: true, value: toThreadView(access, thread, comments) };
  }

  /** 解決・再開の共通手順: (0) 読み取りと能力判定 → (1) 更新（changes 0 は冪等成功）→ (2) 読み直し */
  async function transitionThread(
    access: CommentAccess,
    threadId: string,
    update: (actor: Actor) => Promise<number>,
  ): Promise<ShareResult<ShareCommentThreadView>> {
    const actor = access.actor;
    if (actor === null) return UNAUTHENTICATED;
    return guardStorage(async () => {
      const thread = await commentStore.getThread(access.map.id, threadId);
      if (!thread || !threadCapabilities(access, thread).canResolve)
        return NOT_FOUND;
      await update(actor);
      return reloadThreadView(access, threadId);
    });
  }

  return {
    async resolveAccess(scope, options) {
      return guardStorage(() =>
        scope.kind === "token"
          ? resolveTokenAccess(scope.token, options.requireActor)
          : resolveOwnerAccess(scope.sharedMapId),
      );
    },

    async list(access) {
      return guardStorage(async () => {
        const threads = await commentStore.listThreadsByMap(access.map.id);
        const comments = await commentStore.listCommentsByMap(access.map.id);
        const commentsByThread = new Map<string, ShareCommentRecord[]>();
        for (const comment of comments) {
          const bucket = commentsByThread.get(comment.threadId);
          if (bucket) bucket.push(comment);
          else commentsByThread.set(comment.threadId, [comment]);
        }
        // コメント 0 件のスレッド（補償漏れ）とスレッドの無いコメントは返さない（§5.6）
        const views = threads.flatMap((thread) => {
          const threadComments = commentsByThread.get(thread.id);
          return threadComments
            ? [toThreadView(access, thread, threadComments)]
            : [];
        });
        const signedIn = access.actor !== null;
        return {
          ok: true,
          value: {
            threads: views,
            viewer: { signedIn, canPost: signedIn, isOwner: access.isOwner },
          },
        };
      });
    },

    async createThread(access, input) {
      const actor = access.actor;
      if (actor === null) return UNAUTHENTICATED;
      const body = normalizeShareCommentBody(input.body);
      if (!body.ok) return INVALID_COMMENT;
      if (access.map.currentRevisionId === null)
        return { ok: false, reason: "not-published" };

      return guardStorage(async () => {
        const loaded = await loadCurrentShareDocument(store, access.map);
        if (!loaded.ok) return loaded;
        const parsed = parseMapDocumentJson(loaded.value.documentJson);
        if (!parsed.ok) return STORAGE_ERROR;
        const node = parsed.value.nodes.find(
          (candidate) => candidate.id === input.nodeId,
        );
        if (!node) return { ok: false, reason: "invalid-node" };

        const sharedMapId = access.map.id;
        const threadId = createId();
        const createdAt = nowIso();
        const inserted = await commentStore.insertThreadWithinLimits({
          id: threadId,
          sharedMapId,
          nodeId: node.id,
          nodeLabelSnapshot: normalizeShareCommentNodeLabel(node.label),
          status: "open",
          createdByUserId: actor.userId,
          createdAt,
          updatedAt: createdAt,
          resolvedByUserId: null,
          resolvedByName: null,
          resolvedAt: null,
        });
        if (!inserted) return COMMENT_LIMIT;

        let failure: ShareResult<never> | null = null;
        try {
          const commentInserted = await commentStore.insertCommentWithinLimits({
            id: createId(),
            threadId,
            sharedMapId,
            authorUserId: actor.userId,
            authorName: actor.displayName,
            body: body.value,
            createdAt,
          });
          if (!commentInserted) failure = COMMENT_LIMIT;
        } catch {
          failure = STORAGE_ERROR;
        }
        if (failure !== null) {
          // 補償: コメントの無いスレッドを残さない。INSERT の例外は D1 側で commit 済みの
          // 可能性があるため、先にそのスレッドのコメントを消してからスレッドを消す（孤児コメントが
          // マップの上限を消費し続けないように）。コメントを消せなければスレッドは残す。
          // 補償の失敗は握りつぶす（コメント 0 件のスレッドは一覧に出ない）
          try {
            await commentStore.deleteCommentsByThread(sharedMapId, threadId);
            await commentStore.deleteThread(sharedMapId, threadId);
          } catch {
            // 握りつぶす
          }
          return failure;
        }
        return reloadThreadView(access, threadId);
      });
    },

    async reply(access, threadId, input) {
      const actor = access.actor;
      if (actor === null) return UNAUTHENTICATED;
      const body = normalizeShareCommentBody(input.body);
      if (!body.ok) return INVALID_COMMENT;

      return guardStorage(async () => {
        const sharedMapId = access.map.id;
        const inserted = await commentStore.insertCommentWithinLimits({
          id: createId(),
          threadId,
          sharedMapId,
          authorUserId: actor.userId,
          authorName: actor.displayName,
          body: body.value,
          createdAt: nowIso(),
        });
        if (!inserted) {
          // 1 文の INSERT が通らなかったときだけ理由を分ける（L-862）
          const thread = await commentStore.getThread(sharedMapId, threadId);
          if (!thread) return NOT_FOUND;
          if (thread.status === "resolved")
            return { ok: false, reason: "thread-resolved" };
          return COMMENT_LIMIT;
        }
        return reloadThreadView(access, threadId);
      });
    },

    async resolveThread(access, threadId) {
      return transitionThread(access, threadId, (actor) =>
        commentStore.resolveThread(access.map.id, threadId, {
          userId: actor.userId,
          name: actor.displayName,
          at: nowIso(),
        }),
      );
    },

    async reopenThread(access, threadId) {
      return transitionThread(access, threadId, () =>
        commentStore.reopenThread(access.map.id, threadId, nowIso()),
      );
    },

    async deleteComment(access, commentId) {
      if (access.actor === null) return UNAUTHENTICATED;

      return guardStorage(async () => {
        const sharedMapId = access.map.id;
        const comment = await commentStore.getComment(sharedMapId, commentId);
        if (!comment) return NOT_FOUND;
        const thread = await commentStore.getThread(
          sharedMapId,
          comment.threadId,
        );
        if (!thread) return NOT_FOUND;
        const { canDelete } = resolveShareCommentCapabilities({
          viewerUserId: viewerUserId(access),
          isOwner: access.isOwner,
          threadCreatedByUserId: thread.createdByUserId,
          commentAuthorUserId: comment.authorUserId,
        });
        if (!canDelete) return NOT_FOUND;

        const deleted = await commentStore.deleteComment(
          sharedMapId,
          commentId,
        );
        if (deleted === 0) return NOT_FOUND;

        // 主処理は確定済み。空スレッドの後始末の失敗は失敗として返さない（L-575）
        let threadDeleted = false;
        try {
          threadDeleted =
            (await commentStore.deleteThreadIfEmpty(sharedMapId, thread.id)) >
            0;
        } catch {
          threadDeleted = false;
        }
        return { ok: true, value: { commentId, threadDeleted } };
      });
    },
  };
}
