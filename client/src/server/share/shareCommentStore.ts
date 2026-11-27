import {
  SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
  SHARE_COMMENT_MAX_COMMENTS_PER_THREAD,
  SHARE_COMMENT_MAX_THREADS_PER_MAP,
} from "@/domain/share/shareCommentLimits";
import { D1QueryError, type D1Client } from "@/services/share/d1Client";

export type ShareCommentThreadRecord = {
  id: string;
  sharedMapId: string;
  nodeId: number;
  nodeLabelSnapshot: string;
  status: "open" | "resolved";
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
};

export type ShareCommentRecord = {
  id: string;
  threadId: string;
  sharedMapId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

/** スレッド・コメントの永続化。すべての SQL は shared_map_id で絞る（L-901） */
export type ShareCommentStore = {
  /** created_at, id 昇順 */
  listThreadsByMap(sharedMapId: string): Promise<ShareCommentThreadRecord[]>;
  /** created_at, id 昇順 */
  listCommentsByMap(sharedMapId: string): Promise<ShareCommentRecord[]>;
  getThread(
    sharedMapId: string,
    threadId: string,
  ): Promise<ShareCommentThreadRecord | null>;
  getComment(
    sharedMapId: string,
    commentId: string,
  ): Promise<ShareCommentRecord | null>;
  listCommentsByThread(
    sharedMapId: string,
    threadId: string,
  ): Promise<ShareCommentRecord[]>;
  /** 上限内なら INSERT して true。上限なら false（1 文の INSERT ... SELECT ... WHERE） */
  insertThreadWithinLimits(row: ShareCommentThreadRecord): Promise<boolean>;
  /** スレッドが同じマップに存在し open で、上限内なら INSERT して true。それ以外 false（1 文） */
  insertCommentWithinLimits(row: ShareCommentRecord): Promise<boolean>;
  /** 戻り値は changes */
  resolveThread(
    sharedMapId: string,
    threadId: string,
    resolved: { userId: string; name: string; at: string },
  ): Promise<number>;
  reopenThread(
    sharedMapId: string,
    threadId: string,
    updatedAt: string,
  ): Promise<number>;
  deleteComment(sharedMapId: string, commentId: string): Promise<number>;
  deleteThreadIfEmpty(sharedMapId: string, threadId: string): Promise<number>;
  /** 補償用（API からは呼ばない） */
  deleteThread(sharedMapId: string, threadId: string): Promise<number>;
  /** 補償用（API からは呼ばない）。戻り値は changes */
  deleteCommentsByThread(
    sharedMapId: string,
    threadId: string,
  ): Promise<number>;
  deleteCommentsByMap(sharedMapId: string): Promise<void>;
  deleteThreadsByMap(sharedMapId: string): Promise<void>;
};

type ThreadRow = {
  id: string;
  shared_map_id: string;
  node_id: number;
  node_label_snapshot: string;
  status: "open" | "resolved";
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  resolved_by_user_id: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
};

type CommentRow = {
  id: string;
  thread_id: string;
  shared_map_id: string;
  author_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

const THREAD_COLUMNS =
  "id, shared_map_id, node_id, node_label_snapshot, status, created_by_user_id, created_at, updated_at, resolved_by_user_id, resolved_by_name, resolved_at";
const COMMENT_COLUMNS =
  "id, thread_id, shared_map_id, author_user_id, author_name, body, created_at";

function threadFromRow(row: ThreadRow): ShareCommentThreadRecord {
  return {
    id: row.id,
    sharedMapId: row.shared_map_id,
    nodeId: row.node_id,
    nodeLabelSnapshot: row.node_label_snapshot,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedByName: row.resolved_by_name,
    resolvedAt: row.resolved_at,
  };
}

function commentFromRow(row: CommentRow): ShareCommentRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    sharedMapId: row.shared_map_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * D1 REST 応答の meta.changes を読む。安全な非負整数でなければ失敗とする
 * （形が想定と違うのを「0 件」として扱わない。L-044 / L-470）
 */
export function readD1Changes(meta: unknown): number {
  if (typeof meta !== "object" || meta === null)
    throw new D1QueryError("failed");
  const changes = (meta as { changes?: unknown }).changes;
  if (
    typeof changes !== "number" ||
    !Number.isSafeInteger(changes) ||
    changes < 0
  ) {
    throw new D1QueryError("failed");
  }
  return changes;
}

/** D1 REST のスレッド・コメントの永続化（1 リクエスト 1 文。判定と書き込みは 1 文にまとめる。L-862） */
export function createCloudflareShareCommentStore(
  d1: D1Client,
): ShareCommentStore {
  async function execChanges(sql: string, params: unknown[]): Promise<number> {
    const result = await d1.exec(sql, params);
    return readD1Changes(result.meta);
  }

  return {
    async listThreadsByMap(sharedMapId) {
      const result = await d1.exec(
        `SELECT ${THREAD_COLUMNS} FROM share_comment_threads WHERE shared_map_id = ? ORDER BY created_at ASC, id ASC`,
        [sharedMapId],
      );
      return (result.results as ThreadRow[]).map(threadFromRow);
    },

    async listCommentsByMap(sharedMapId) {
      const result = await d1.exec(
        `SELECT ${COMMENT_COLUMNS} FROM share_comments WHERE shared_map_id = ? ORDER BY created_at ASC, id ASC`,
        [sharedMapId],
      );
      return (result.results as CommentRow[]).map(commentFromRow);
    },

    async getThread(sharedMapId, threadId) {
      const result = await d1.exec(
        `SELECT ${THREAD_COLUMNS} FROM share_comment_threads WHERE id = ? AND shared_map_id = ? LIMIT 1`,
        [threadId, sharedMapId],
      );
      const row = result.results[0] as ThreadRow | undefined;
      return row ? threadFromRow(row) : null;
    },

    async getComment(sharedMapId, commentId) {
      const result = await d1.exec(
        `SELECT ${COMMENT_COLUMNS} FROM share_comments WHERE id = ? AND shared_map_id = ? LIMIT 1`,
        [commentId, sharedMapId],
      );
      const row = result.results[0] as CommentRow | undefined;
      return row ? commentFromRow(row) : null;
    },

    async listCommentsByThread(sharedMapId, threadId) {
      const result = await d1.exec(
        `SELECT ${COMMENT_COLUMNS} FROM share_comments WHERE thread_id = ? AND shared_map_id = ? ORDER BY created_at ASC, id ASC`,
        [threadId, sharedMapId],
      );
      return (result.results as CommentRow[]).map(commentFromRow);
    },

    async insertThreadWithinLimits(row) {
      const changes = await execChanges(
        `INSERT INTO share_comment_threads (${THREAD_COLUMNS}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM share_comment_threads WHERE shared_map_id = ?) < ? AND (SELECT COUNT(*) FROM share_comments WHERE shared_map_id = ?) < ?`,
        [
          row.id,
          row.sharedMapId,
          row.nodeId,
          row.nodeLabelSnapshot,
          row.status,
          row.createdByUserId,
          row.createdAt,
          row.updatedAt,
          row.resolvedByUserId,
          row.resolvedByName,
          row.resolvedAt,
          row.sharedMapId,
          SHARE_COMMENT_MAX_THREADS_PER_MAP,
          row.sharedMapId,
          SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
        ],
      );
      return changes > 0;
    },

    async insertCommentWithinLimits(row) {
      const changes = await execChanges(
        `INSERT INTO share_comments (${COMMENT_COLUMNS}) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM share_comment_threads WHERE id = ? AND shared_map_id = ? AND status = 'open') AND (SELECT COUNT(*) FROM share_comments WHERE thread_id = ? AND shared_map_id = ?) < ? AND (SELECT COUNT(*) FROM share_comments WHERE shared_map_id = ?) < ?`,
        [
          row.id,
          row.threadId,
          row.sharedMapId,
          row.authorUserId,
          row.authorName,
          row.body,
          row.createdAt,
          row.threadId,
          row.sharedMapId,
          row.threadId,
          row.sharedMapId,
          SHARE_COMMENT_MAX_COMMENTS_PER_THREAD,
          row.sharedMapId,
          SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
        ],
      );
      return changes > 0;
    },

    async resolveThread(sharedMapId, threadId, resolved) {
      return execChanges(
        "UPDATE share_comment_threads SET status = 'resolved', resolved_by_user_id = ?, resolved_by_name = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND shared_map_id = ? AND status = 'open'",
        [
          resolved.userId,
          resolved.name,
          resolved.at,
          resolved.at,
          threadId,
          sharedMapId,
        ],
      );
    },

    async reopenThread(sharedMapId, threadId, updatedAt) {
      return execChanges(
        "UPDATE share_comment_threads SET status = 'open', resolved_by_user_id = NULL, resolved_by_name = NULL, resolved_at = NULL, updated_at = ? WHERE id = ? AND shared_map_id = ? AND status = 'resolved'",
        [updatedAt, threadId, sharedMapId],
      );
    },

    async deleteComment(sharedMapId, commentId) {
      return execChanges(
        "DELETE FROM share_comments WHERE id = ? AND shared_map_id = ?",
        [commentId, sharedMapId],
      );
    },

    async deleteThreadIfEmpty(sharedMapId, threadId) {
      return execChanges(
        "DELETE FROM share_comment_threads WHERE id = ? AND shared_map_id = ? AND NOT EXISTS (SELECT 1 FROM share_comments WHERE thread_id = ? AND shared_map_id = ?)",
        [threadId, sharedMapId, threadId, sharedMapId],
      );
    },

    async deleteThread(sharedMapId, threadId) {
      return execChanges(
        "DELETE FROM share_comment_threads WHERE id = ? AND shared_map_id = ?",
        [threadId, sharedMapId],
      );
    },

    async deleteCommentsByThread(sharedMapId, threadId) {
      return execChanges(
        "DELETE FROM share_comments WHERE thread_id = ? AND shared_map_id = ?",
        [threadId, sharedMapId],
      );
    },

    async deleteCommentsByMap(sharedMapId) {
      await d1.exec("DELETE FROM share_comments WHERE shared_map_id = ?", [
        sharedMapId,
      ]);
    },

    async deleteThreadsByMap(sharedMapId) {
      await d1.exec(
        "DELETE FROM share_comment_threads WHERE shared_map_id = ?",
        [sharedMapId],
      );
    },
  };
}
