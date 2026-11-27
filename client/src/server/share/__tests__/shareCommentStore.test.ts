/** @jest-environment node */

import {
  SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
  SHARE_COMMENT_MAX_COMMENTS_PER_THREAD,
  SHARE_COMMENT_MAX_THREADS_PER_MAP,
} from "@/domain/share/shareCommentLimits";
import {
  D1QueryError,
  type D1Client,
  type D1ExecResult,
} from "@/services/share/d1Client";
import {
  createCloudflareShareCommentStore,
  readD1Changes,
  type ShareCommentRecord,
  type ShareCommentThreadRecord,
} from "@/server/share/shareCommentStore";

/*
 * D1 モックの応答形の根拠（L-059）:
 * Cloudflare API リファレンス「D1 > Database > Query D1 Database」の「Returns」節
 * （https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/ 、2026-11-27 確認）。
 * 成功応答は `{ success: true, result: [{ results: unknown[], success, meta: { changes: number, changed_db, last_row_id, rows_read, rows_written, ... } }] }`。
 * 既存 `d1Client.ts` の exec はこの `result[0]` から `{ results, meta }` を取り出して返すので、
 * ここでは exec の戻り値として `{ results, meta: { changes } }` を返すモックにする。
 * `meta.changes` は「クエリで変更された行数のおおよその値」（sqlite3_total_changes 由来）と説明されている。
 * 条件付き `INSERT ... SELECT ... WHERE` で WHERE が偽のとき 0 になることは SQLite の挙動に基づく前提で、
 * 実環境では手動テスト（上限到達で 409）で確かめる。
 */

type ExecCall = { sql: string; params: unknown[] };

function createMockD1(responses: D1ExecResult[] = []): {
  d1: D1Client;
  calls: ExecCall[];
} {
  const calls: ExecCall[] = [];
  const queue = [...responses];
  const d1: D1Client = {
    async exec(sql, params = []) {
      calls.push({ sql, params });
      return queue.shift() ?? { results: [], meta: { changes: 0 } };
    },
  };
  return { d1, calls };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const threadRow = {
  id: "t1",
  shared_map_id: "m1",
  node_id: 7,
  node_label_snapshot: "ラベル",
  status: "resolved",
  created_by_user_id: "sub-1",
  created_at: "2026-11-27T00:00:00.000Z",
  updated_at: "2026-11-27T01:00:00.000Z",
  resolved_by_user_id: "sub-2",
  resolved_by_name: "解決者",
  resolved_at: "2026-11-27T01:00:00.000Z",
};

const threadRecord: ShareCommentThreadRecord = {
  id: "t1",
  sharedMapId: "m1",
  nodeId: 7,
  nodeLabelSnapshot: "ラベル",
  status: "resolved",
  createdByUserId: "sub-1",
  createdAt: "2026-11-27T00:00:00.000Z",
  updatedAt: "2026-11-27T01:00:00.000Z",
  resolvedByUserId: "sub-2",
  resolvedByName: "解決者",
  resolvedAt: "2026-11-27T01:00:00.000Z",
};

const commentRow = {
  id: "c1",
  thread_id: "t1",
  shared_map_id: "m1",
  author_user_id: "sub-1",
  author_name: "投稿者",
  body: "本文",
  created_at: "2026-11-27T00:00:00.000Z",
};

const commentRecord: ShareCommentRecord = {
  id: "c1",
  threadId: "t1",
  sharedMapId: "m1",
  authorUserId: "sub-1",
  authorName: "投稿者",
  body: "本文",
  createdAt: "2026-11-27T00:00:00.000Z",
};

const THREAD_COLUMNS =
  "id, shared_map_id, node_id, node_label_snapshot, status, created_by_user_id, created_at, updated_at, resolved_by_user_id, resolved_by_name, resolved_at";
const COMMENT_COLUMNS =
  "id, thread_id, shared_map_id, author_user_id, author_name, body, created_at";

describe("readD1Changes", () => {
  it("安全な非負整数の changes を返す", () => {
    expect(readD1Changes({ changes: 1 })).toBe(1);
    expect(readD1Changes({ changes: 0, rows_written: 0 })).toBe(0);
  });

  it.each([
    ["空オブジェクト", {}],
    ["文字列", { changes: "1" }],
    ["負数", { changes: -1 }],
    ["小数", { changes: 1.5 }],
    ["安全でない整数", { changes: Number.MAX_SAFE_INTEGER + 1 }],
    ["NaN", { changes: Number.NaN }],
    ["null", null],
    ["undefined", undefined],
    ["数値そのもの", 1],
  ])(
    "%s は D1QueryError(failed) を投げる（0 件と扱わない）",
    (_label, meta) => {
      let thrown: unknown;
      try {
        readD1Changes(meta);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(D1QueryError);
      expect((thrown as D1QueryError).kind).toBe("failed");
    },
  );
});

describe("createCloudflareShareCommentStore", () => {
  it("listThreadsByMap は shared_map_id で絞り created_at, id 昇順で読み、camelCase に写す", async () => {
    const { d1, calls } = createMockD1([{ results: [threadRow], meta: {} }]);
    const store = createCloudflareShareCommentStore(d1);

    const threads = await store.listThreadsByMap("m1");

    expect(threads).toEqual([threadRecord]);
    expect(typeof threads[0].nodeId).toBe("number");
    expect(normalizeSql(calls[0].sql)).toBe(
      `SELECT ${THREAD_COLUMNS} FROM share_comment_threads WHERE shared_map_id = ? ORDER BY created_at ASC, id ASC`,
    );
    expect(calls[0].params).toEqual(["m1"]);
  });

  it("open スレッドの resolved_* は null のまま写す", async () => {
    const { d1 } = createMockD1([
      {
        results: [
          {
            ...threadRow,
            status: "open",
            resolved_by_user_id: null,
            resolved_by_name: null,
            resolved_at: null,
          },
        ],
        meta: {},
      },
    ]);
    const store = createCloudflareShareCommentStore(d1);

    const [thread] = await store.listThreadsByMap("m1");

    expect(thread).toEqual({
      ...threadRecord,
      status: "open",
      resolvedByUserId: null,
      resolvedByName: null,
      resolvedAt: null,
    });
  });

  it("listCommentsByMap は shared_map_id で絞り created_at, id 昇順で読む", async () => {
    const { d1, calls } = createMockD1([{ results: [commentRow], meta: {} }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.listCommentsByMap("m1")).resolves.toEqual([
      commentRecord,
    ]);
    expect(normalizeSql(calls[0].sql)).toBe(
      `SELECT ${COMMENT_COLUMNS} FROM share_comments WHERE shared_map_id = ? ORDER BY created_at ASC, id ASC`,
    );
    expect(calls[0].params).toEqual(["m1"]);
  });

  it("getThread は id と shared_map_id で絞る。無ければ null", async () => {
    const { d1, calls } = createMockD1([
      { results: [threadRow], meta: {} },
      { results: [], meta: {} },
    ]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.getThread("m1", "t1")).resolves.toEqual(threadRecord);
    await expect(store.getThread("m1", "missing")).resolves.toBeNull();
    expect(normalizeSql(calls[0].sql)).toBe(
      `SELECT ${THREAD_COLUMNS} FROM share_comment_threads WHERE id = ? AND shared_map_id = ? LIMIT 1`,
    );
    expect(calls[0].params).toEqual(["t1", "m1"]);
    expect(calls[1].params).toEqual(["missing", "m1"]);
  });

  it("getComment は id と shared_map_id で絞る。無ければ null", async () => {
    const { d1, calls } = createMockD1([
      { results: [commentRow], meta: {} },
      { results: [], meta: {} },
    ]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.getComment("m1", "c1")).resolves.toEqual(commentRecord);
    await expect(store.getComment("m1", "missing")).resolves.toBeNull();
    expect(normalizeSql(calls[0].sql)).toBe(
      `SELECT ${COMMENT_COLUMNS} FROM share_comments WHERE id = ? AND shared_map_id = ? LIMIT 1`,
    );
    expect(calls[0].params).toEqual(["c1", "m1"]);
  });

  it("listCommentsByThread は thread_id と shared_map_id で絞り昇順で読む", async () => {
    const { d1, calls } = createMockD1([{ results: [commentRow], meta: {} }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.listCommentsByThread("m1", "t1")).resolves.toEqual([
      commentRecord,
    ]);
    expect(normalizeSql(calls[0].sql)).toBe(
      `SELECT ${COMMENT_COLUMNS} FROM share_comments WHERE thread_id = ? AND shared_map_id = ? ORDER BY created_at ASC, id ASC`,
    );
    expect(calls[0].params).toEqual(["t1", "m1"]);
  });

  describe("insertThreadWithinLimits", () => {
    const openThread: ShareCommentThreadRecord = {
      ...threadRecord,
      status: "open",
      resolvedByUserId: null,
      resolvedByName: null,
      resolvedAt: null,
    };

    it("1 文の INSERT ... SELECT ... WHERE で、マップのスレッド数・コメント数の上限を判定する", async () => {
      const { d1, calls } = createMockD1([
        { results: [], meta: { changes: 1 } },
      ]);
      const store = createCloudflareShareCommentStore(d1);

      await expect(store.insertThreadWithinLimits(openThread)).resolves.toBe(
        true,
      );

      expect(calls).toHaveLength(1);
      expect(normalizeSql(calls[0].sql)).toBe(
        `INSERT INTO share_comment_threads (${THREAD_COLUMNS}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM share_comment_threads WHERE shared_map_id = ?) < ? AND (SELECT COUNT(*) FROM share_comments WHERE shared_map_id = ?) < ?`,
      );
      expect(calls[0].params).toEqual([
        "t1",
        "m1",
        7,
        "ラベル",
        "open",
        "sub-1",
        "2026-11-27T00:00:00.000Z",
        "2026-11-27T01:00:00.000Z",
        null,
        null,
        null,
        "m1",
        SHARE_COMMENT_MAX_THREADS_PER_MAP,
        "m1",
        SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
      ]);
    });

    it("changes が 0 なら false（上限）", async () => {
      const { d1 } = createMockD1([{ results: [], meta: { changes: 0 } }]);
      const store = createCloudflareShareCommentStore(d1);

      await expect(store.insertThreadWithinLimits(openThread)).resolves.toBe(
        false,
      );
    });

    it("meta の形が想定外なら D1QueryError(failed)", async () => {
      const { d1 } = createMockD1([{ results: [], meta: undefined }]);
      const store = createCloudflareShareCommentStore(d1);

      await expect(
        store.insertThreadWithinLimits(openThread),
      ).rejects.toBeInstanceOf(D1QueryError);
    });
  });

  describe("insertCommentWithinLimits", () => {
    it("1 文で、同じマップの open スレッドの存在・スレッド内とマップ内の上限を判定する", async () => {
      const { d1, calls } = createMockD1([
        { results: [], meta: { changes: 1 } },
      ]);
      const store = createCloudflareShareCommentStore(d1);

      await expect(
        store.insertCommentWithinLimits(commentRecord),
      ).resolves.toBe(true);

      expect(calls).toHaveLength(1);
      expect(normalizeSql(calls[0].sql)).toBe(
        `INSERT INTO share_comments (${COMMENT_COLUMNS}) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM share_comment_threads WHERE id = ? AND shared_map_id = ? AND status = 'open') AND (SELECT COUNT(*) FROM share_comments WHERE thread_id = ? AND shared_map_id = ?) < ? AND (SELECT COUNT(*) FROM share_comments WHERE shared_map_id = ?) < ?`,
      );
      expect(calls[0].params).toEqual([
        "c1",
        "t1",
        "m1",
        "sub-1",
        "投稿者",
        "本文",
        "2026-11-27T00:00:00.000Z",
        "t1",
        "m1",
        "t1",
        "m1",
        SHARE_COMMENT_MAX_COMMENTS_PER_THREAD,
        "m1",
        SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
      ]);
    });

    it("changes が 0 なら false", async () => {
      const { d1 } = createMockD1([{ results: [], meta: { changes: 0 } }]);
      const store = createCloudflareShareCommentStore(d1);

      await expect(
        store.insertCommentWithinLimits(commentRecord),
      ).resolves.toBe(false);
    });
  });

  it("resolveThread は open のときだけ解決者と日時を書き、changes を返す", async () => {
    const { d1, calls } = createMockD1([{ results: [], meta: { changes: 1 } }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(
      store.resolveThread("m1", "t1", {
        userId: "sub-2",
        name: "解決者",
        at: "2026-11-27T02:00:00.000Z",
      }),
    ).resolves.toBe(1);
    expect(normalizeSql(calls[0].sql)).toBe(
      "UPDATE share_comment_threads SET status = 'resolved', resolved_by_user_id = ?, resolved_by_name = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND shared_map_id = ? AND status = 'open'",
    );
    expect(calls[0].params).toEqual([
      "sub-2",
      "解決者",
      "2026-11-27T02:00:00.000Z",
      "2026-11-27T02:00:00.000Z",
      "t1",
      "m1",
    ]);
  });

  it("reopenThread は resolved のときだけ resolved_* を NULL に戻し、changes を返す", async () => {
    const { d1, calls } = createMockD1([{ results: [], meta: { changes: 0 } }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(
      store.reopenThread("m1", "t1", "2026-11-27T03:00:00.000Z"),
    ).resolves.toBe(0);
    expect(normalizeSql(calls[0].sql)).toBe(
      "UPDATE share_comment_threads SET status = 'open', resolved_by_user_id = NULL, resolved_by_name = NULL, resolved_at = NULL, updated_at = ? WHERE id = ? AND shared_map_id = ? AND status = 'resolved'",
    );
    expect(calls[0].params).toEqual(["2026-11-27T03:00:00.000Z", "t1", "m1"]);
  });

  it("deleteComment は id と shared_map_id で絞って消し、changes を返す", async () => {
    const { d1, calls } = createMockD1([{ results: [], meta: { changes: 1 } }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.deleteComment("m1", "c1")).resolves.toBe(1);
    expect(normalizeSql(calls[0].sql)).toBe(
      "DELETE FROM share_comments WHERE id = ? AND shared_map_id = ?",
    );
    expect(calls[0].params).toEqual(["c1", "m1"]);
  });

  it("deleteThreadIfEmpty は内側の NOT EXISTS も shared_map_id で絞る 1 文", async () => {
    const { d1, calls } = createMockD1([{ results: [], meta: { changes: 1 } }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.deleteThreadIfEmpty("m1", "t1")).resolves.toBe(1);
    expect(calls).toHaveLength(1);
    expect(normalizeSql(calls[0].sql)).toBe(
      "DELETE FROM share_comment_threads WHERE id = ? AND shared_map_id = ? AND NOT EXISTS (SELECT 1 FROM share_comments WHERE thread_id = ? AND shared_map_id = ?)",
    );
    expect(calls[0].params).toEqual(["t1", "m1", "t1", "m1"]);
  });

  it("deleteThread は id と shared_map_id で絞って消し、changes を返す", async () => {
    const { d1, calls } = createMockD1([{ results: [], meta: { changes: 1 } }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.deleteThread("m1", "t1")).resolves.toBe(1);
    expect(normalizeSql(calls[0].sql)).toBe(
      "DELETE FROM share_comment_threads WHERE id = ? AND shared_map_id = ?",
    );
    expect(calls[0].params).toEqual(["t1", "m1"]);
  });

  it("deleteCommentsByThread は thread_id と shared_map_id で絞って消し、changes を返す", async () => {
    const { d1, calls } = createMockD1([{ results: [], meta: { changes: 2 } }]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.deleteCommentsByThread("m1", "t1")).resolves.toBe(2);
    expect(calls).toHaveLength(1);
    expect(normalizeSql(calls[0].sql)).toBe(
      "DELETE FROM share_comments WHERE thread_id = ? AND shared_map_id = ?",
    );
    expect(calls[0].params).toEqual(["t1", "m1"]);
  });

  it("deleteCommentsByMap / deleteThreadsByMap は shared_map_id で一括削除する", async () => {
    const { d1, calls } = createMockD1();
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.deleteCommentsByMap("m1")).resolves.toBeUndefined();
    await expect(store.deleteThreadsByMap("m1")).resolves.toBeUndefined();
    expect(normalizeSql(calls[0].sql)).toBe(
      "DELETE FROM share_comments WHERE shared_map_id = ?",
    );
    expect(calls[0].params).toEqual(["m1"]);
    expect(normalizeSql(calls[1].sql)).toBe(
      "DELETE FROM share_comment_threads WHERE shared_map_id = ?",
    );
    expect(calls[1].params).toEqual(["m1"]);
  });

  it("changes を返すメソッドは meta の形が想定外なら D1QueryError(failed)", async () => {
    const { d1 } = createMockD1([
      { results: [], meta: { changes: "1" } },
      { results: [], meta: {} },
      { results: [], meta: null },
      { results: [], meta: { changes: -1 } },
      { results: [], meta: { changes: 0.5 } },
      { results: [], meta: { changes: "2" } },
    ]);
    const store = createCloudflareShareCommentStore(d1);

    await expect(
      store.resolveThread("m1", "t1", { userId: "u", name: "n", at: "a" }),
    ).rejects.toBeInstanceOf(D1QueryError);
    await expect(store.reopenThread("m1", "t1", "a")).rejects.toBeInstanceOf(
      D1QueryError,
    );
    await expect(store.deleteComment("m1", "c1")).rejects.toBeInstanceOf(
      D1QueryError,
    );
    await expect(store.deleteThreadIfEmpty("m1", "t1")).rejects.toBeInstanceOf(
      D1QueryError,
    );
    await expect(store.deleteThread("m1", "t1")).rejects.toBeInstanceOf(
      D1QueryError,
    );
    await expect(
      store.deleteCommentsByThread("m1", "t1"),
    ).rejects.toBeInstanceOf(D1QueryError);
  });

  it("D1 の例外はそのまま伝える（no-such-table の判定を呼び出し側に残す）", async () => {
    const d1: D1Client = {
      exec: jest.fn().mockRejectedValue(new D1QueryError("no-such-table")),
    };
    const store = createCloudflareShareCommentStore(d1);

    await expect(store.deleteCommentsByMap("m1")).rejects.toMatchObject({
      kind: "no-such-table",
    });
  });

  it("すべての SQL が shared_map_id = ? を条件に持つ", async () => {
    const { d1, calls } = createMockD1(
      Array.from({ length: 15 }, () => ({ results: [], meta: { changes: 0 } })),
    );
    const store = createCloudflareShareCommentStore(d1);

    await store.listThreadsByMap("m1");
    await store.listCommentsByMap("m1");
    await store.getThread("m1", "t1");
    await store.getComment("m1", "c1");
    await store.listCommentsByThread("m1", "t1");
    await store.insertThreadWithinLimits({ ...threadRecord, status: "open" });
    await store.insertCommentWithinLimits(commentRecord);
    await store.resolveThread("m1", "t1", { userId: "u", name: "n", at: "a" });
    await store.reopenThread("m1", "t1", "a");
    await store.deleteComment("m1", "c1");
    await store.deleteThreadIfEmpty("m1", "t1");
    await store.deleteThread("m1", "t1");
    await store.deleteCommentsByThread("m1", "t1");
    await store.deleteCommentsByMap("m1");
    await store.deleteThreadsByMap("m1");

    expect(calls).toHaveLength(15);
    for (const call of calls) {
      expect(call.sql).toMatch(/WHERE (.* )?shared_map_id = \?/);
    }
  });
});
