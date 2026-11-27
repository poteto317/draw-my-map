import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentThreadView,
  ShareCommentsScope,
} from "@/domain/share/shareComment";
import type { ShareResult } from "@/domain/share/shareResult";
import { parseShareResult, resolveFetch } from "@/services/share/shareApiClient";

/** コメント API の経路の基底パス（token: 閲覧リンク、owner: 所有者セッション＋sharedMapId） */
export function shareCommentsBasePath(scope: ShareCommentsScope): string {
  return scope.kind === "token"
    ? `/api/share/view/${encodeURIComponent(scope.token)}`
    : `/api/share/maps/${encodeURIComponent(scope.sharedMapId)}`;
}

export type ShareCommentsApiClient = {
  list(scope: ShareCommentsScope): Promise<ShareResult<ShareCommentListValue>>;
  createThread(
    scope: ShareCommentsScope,
    input: { nodeId: number; body: string },
  ): Promise<ShareResult<ShareCommentThreadView>>;
  reply(
    scope: ShareCommentsScope,
    threadId: string,
    input: { body: string },
  ): Promise<ShareResult<ShareCommentThreadView>>;
  resolve(scope: ShareCommentsScope, threadId: string): Promise<ShareResult<ShareCommentThreadView>>;
  reopen(scope: ShareCommentsScope, threadId: string): Promise<ShareResult<ShareCommentThreadView>>;
  deleteComment(
    scope: ShareCommentsScope,
    commentId: string,
  ): Promise<ShareResult<ShareCommentDeleteValue>>;
};

function threadPath(scope: ShareCommentsScope, threadId: string, action: string): string {
  return `${shareCommentsBasePath(scope)}/comment-threads/${encodeURIComponent(threadId)}/${action}`;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function createShareCommentsApiClient(fetchImpl?: typeof fetch): ShareCommentsApiClient {
  const doFetch = resolveFetch(fetchImpl);

  // fetch の例外（オフラインなど）は network-error に正規化する
  async function request<T>(url: string, init: RequestInit): Promise<ShareResult<T>> {
    try {
      const response = await doFetch(url, init);
      return await parseShareResult<T>(response);
    } catch {
      return { ok: false, reason: "network-error" };
    }
  }

  return {
    list(scope) {
      return request(`${shareCommentsBasePath(scope)}/comment-threads`, { method: "GET" });
    },
    createThread(scope, input) {
      return request(
        `${shareCommentsBasePath(scope)}/comment-threads`,
        jsonPost({ nodeId: input.nodeId, body: input.body }),
      );
    },
    reply(scope, threadId, input) {
      return request(threadPath(scope, threadId, "replies"), jsonPost({ body: input.body }));
    },
    resolve(scope, threadId) {
      return request(threadPath(scope, threadId, "resolve"), { method: "POST" });
    },
    reopen(scope, threadId) {
      return request(threadPath(scope, threadId, "reopen"), { method: "POST" });
    },
    deleteComment(scope, commentId) {
      return request(
        `${shareCommentsBasePath(scope)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
    },
  };
}
