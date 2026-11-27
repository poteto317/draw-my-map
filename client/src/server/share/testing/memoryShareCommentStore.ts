import {
  SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
  SHARE_COMMENT_MAX_COMMENTS_PER_THREAD,
  SHARE_COMMENT_MAX_THREADS_PER_MAP,
} from "@/domain/share/shareCommentLimits";
import { D1QueryError } from "@/services/share/d1Client";
import type {
  ShareCommentRecord,
  ShareCommentStore,
  ShareCommentThreadRecord,
} from "@/server/share/shareCommentStore";

export type MemoryShareCommentStore = ShareCommentStore & {
  /** テストから直接見る・仕込む */
  readonly threads: ShareCommentThreadRecord[];
  readonly comments: ShareCommentRecord[];
};

function byCreatedAtThenId<T extends { createdAt: string; id: string }>(
  a: T,
  b: T,
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** 条件に合う要素を配列から取り除き、取り除いた件数を返す（配列の参照は保つ） */
function removeWhere<T>(rows: T[], predicate: (row: T) => boolean): number {
  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (predicate(rows[i])) {
      rows.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

/** API 契約テスト用のインメモリ ShareCommentStore（D1 版と同じ意味を持つ） */
export function createMemoryShareCommentStore(
  options: {
    /** true なら全メソッドが D1QueryError("no-such-table") を投げる（DDL 未実行の再現） */
    missingTables?: boolean;
    /** 指定したメソッド名の次の 1 回だけ D1QueryError("failed") を投げる */
    failOnce?: ReadonlyArray<keyof ShareCommentStore>;
  } = {},
): MemoryShareCommentStore {
  const threads: ShareCommentThreadRecord[] = [];
  const comments: ShareCommentRecord[] = [];
  const pendingFailures = new Set<keyof ShareCommentStore>(
    options.failOnce ?? [],
  );

  function guard(method: keyof ShareCommentStore): void {
    if (options.missingTables) throw new D1QueryError("no-such-table");
    if (pendingFailures.delete(method)) throw new D1QueryError("failed");
  }

  function findThread(
    sharedMapId: string,
    threadId: string,
  ): ShareCommentThreadRecord | undefined {
    return threads.find(
      (t) => t.id === threadId && t.sharedMapId === sharedMapId,
    );
  }

  function countComments(
    predicate: (row: ShareCommentRecord) => boolean,
  ): number {
    return comments.filter(predicate).length;
  }

  return {
    threads,
    comments,

    async listThreadsByMap(sharedMapId) {
      guard("listThreadsByMap");
      return threads
        .filter((t) => t.sharedMapId === sharedMapId)
        .sort(byCreatedAtThenId)
        .map((t) => ({ ...t }));
    },

    async listCommentsByMap(sharedMapId) {
      guard("listCommentsByMap");
      return comments
        .filter((c) => c.sharedMapId === sharedMapId)
        .sort(byCreatedAtThenId)
        .map((c) => ({ ...c }));
    },

    async getThread(sharedMapId, threadId) {
      guard("getThread");
      const found = findThread(sharedMapId, threadId);
      return found ? { ...found } : null;
    },

    async getComment(sharedMapId, commentId) {
      guard("getComment");
      const found = comments.find(
        (c) => c.id === commentId && c.sharedMapId === sharedMapId,
      );
      return found ? { ...found } : null;
    },

    async listCommentsByThread(sharedMapId, threadId) {
      guard("listCommentsByThread");
      return comments
        .filter((c) => c.threadId === threadId && c.sharedMapId === sharedMapId)
        .sort(byCreatedAtThenId)
        .map((c) => ({ ...c }));
    },

    async insertThreadWithinLimits(row) {
      guard("insertThreadWithinLimits");
      const threadCount = threads.filter(
        (t) => t.sharedMapId === row.sharedMapId,
      ).length;
      const commentCount = countComments(
        (c) => c.sharedMapId === row.sharedMapId,
      );
      if (
        threadCount >= SHARE_COMMENT_MAX_THREADS_PER_MAP ||
        commentCount >= SHARE_COMMENT_MAX_COMMENTS_PER_MAP
      ) {
        return false;
      }
      // 主キー重複は判定を通った後だけ失敗（D1 は WHERE が偽なら重複でも changes 0）
      if (threads.some((t) => t.id === row.id))
        throw new D1QueryError("failed");
      threads.push({ ...row });
      return true;
    },

    async insertCommentWithinLimits(row) {
      guard("insertCommentWithinLimits");
      const target = findThread(row.sharedMapId, row.threadId);
      if (!target || target.status !== "open") return false;
      const threadCommentCount = countComments(
        (c) => c.threadId === row.threadId && c.sharedMapId === row.sharedMapId,
      );
      const mapCommentCount = countComments(
        (c) => c.sharedMapId === row.sharedMapId,
      );
      if (
        threadCommentCount >= SHARE_COMMENT_MAX_COMMENTS_PER_THREAD ||
        mapCommentCount >= SHARE_COMMENT_MAX_COMMENTS_PER_MAP
      ) {
        return false;
      }
      // 主キー重複は判定を通った後だけ失敗（D1 は WHERE が偽なら重複でも changes 0）
      if (comments.some((c) => c.id === row.id))
        throw new D1QueryError("failed");
      comments.push({ ...row });
      return true;
    },

    async resolveThread(sharedMapId, threadId, resolved) {
      guard("resolveThread");
      const index = threads.findIndex(
        (t) =>
          t.id === threadId &&
          t.sharedMapId === sharedMapId &&
          t.status === "open",
      );
      if (index < 0) return 0;
      threads[index] = {
        ...threads[index],
        status: "resolved",
        resolvedByUserId: resolved.userId,
        resolvedByName: resolved.name,
        resolvedAt: resolved.at,
        updatedAt: resolved.at,
      };
      return 1;
    },

    async reopenThread(sharedMapId, threadId, updatedAt) {
      guard("reopenThread");
      const index = threads.findIndex(
        (t) =>
          t.id === threadId &&
          t.sharedMapId === sharedMapId &&
          t.status === "resolved",
      );
      if (index < 0) return 0;
      threads[index] = {
        ...threads[index],
        status: "open",
        resolvedByUserId: null,
        resolvedByName: null,
        resolvedAt: null,
        updatedAt,
      };
      return 1;
    },

    async deleteComment(sharedMapId, commentId) {
      guard("deleteComment");
      return removeWhere(
        comments,
        (c) => c.id === commentId && c.sharedMapId === sharedMapId,
      );
    },

    async deleteThreadIfEmpty(sharedMapId, threadId) {
      guard("deleteThreadIfEmpty");
      const hasComments = comments.some(
        (c) => c.threadId === threadId && c.sharedMapId === sharedMapId,
      );
      if (hasComments) return 0;
      return removeWhere(
        threads,
        (t) => t.id === threadId && t.sharedMapId === sharedMapId,
      );
    },

    async deleteThread(sharedMapId, threadId) {
      guard("deleteThread");
      return removeWhere(
        threads,
        (t) => t.id === threadId && t.sharedMapId === sharedMapId,
      );
    },

    async deleteCommentsByThread(sharedMapId, threadId) {
      guard("deleteCommentsByThread");
      return removeWhere(
        comments,
        (c) => c.threadId === threadId && c.sharedMapId === sharedMapId,
      );
    },

    async deleteCommentsByMap(sharedMapId) {
      guard("deleteCommentsByMap");
      removeWhere(comments, (c) => c.sharedMapId === sharedMapId);
    },

    async deleteThreadsByMap(sharedMapId) {
      guard("deleteThreadsByMap");
      removeWhere(threads, (t) => t.sharedMapId === sharedMapId);
    },
  };
}
