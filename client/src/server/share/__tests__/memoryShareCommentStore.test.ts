/** @jest-environment node */

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
import { createMemoryShareCommentStore } from "@/server/share/testing/memoryShareCommentStore";

function thread(
  overrides: Partial<ShareCommentThreadRecord> = {},
): ShareCommentThreadRecord {
  return {
    id: "t1",
    sharedMapId: "m1",
    nodeId: 1,
    nodeLabelSnapshot: "ラベル",
    status: "open",
    createdByUserId: "sub-1",
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    resolvedByUserId: null,
    resolvedByName: null,
    resolvedAt: null,
    ...overrides,
  };
}

function comment(
  overrides: Partial<ShareCommentRecord> = {},
): ShareCommentRecord {
  return {
    id: "c1",
    threadId: "t1",
    sharedMapId: "m1",
    authorUserId: "sub-1",
    authorName: "投稿者",
    body: "本文",
    createdAt: "2026-11-27T00:00:00.000Z",
    ...overrides,
  };
}

async function expectKind(
  promise: Promise<unknown>,
  kind: D1QueryError["kind"],
): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(D1QueryError);
  expect((thrown as D1QueryError).kind).toBe(kind);
}

describe("createMemoryShareCommentStore", () => {
  describe("一覧と取得", () => {
    it("listThreadsByMap / listCommentsByMap は shared_map_id で絞り created_at, id 昇順", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(
        thread({ id: "t-b", createdAt: "2026-11-27T00:00:02.000Z" }),
        thread({ id: "t-other", sharedMapId: "m2" }),
        thread({ id: "t-c", createdAt: "2026-11-27T00:00:01.000Z" }),
        thread({ id: "t-a", createdAt: "2026-11-27T00:00:01.000Z" }),
      );
      store.comments.push(
        comment({ id: "c-b", createdAt: "2026-11-27T00:00:02.000Z" }),
        comment({ id: "c-other", sharedMapId: "m2" }),
        comment({ id: "c-a", createdAt: "2026-11-27T00:00:02.000Z" }),
      );

      expect((await store.listThreadsByMap("m1")).map((t) => t.id)).toEqual([
        "t-a",
        "t-c",
        "t-b",
      ]);
      expect((await store.listCommentsByMap("m1")).map((c) => c.id)).toEqual([
        "c-a",
        "c-b",
      ]);
    });

    it("getThread / getComment は別のマップの行を返さない", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      store.comments.push(comment());

      await expect(store.getThread("m1", "t1")).resolves.toEqual(thread());
      await expect(store.getThread("m2", "t1")).resolves.toBeNull();
      await expect(store.getComment("m1", "c1")).resolves.toEqual(comment());
      await expect(store.getComment("m2", "c1")).resolves.toBeNull();
    });

    it("listCommentsByThread は thread_id と shared_map_id で絞る", async () => {
      const store = createMemoryShareCommentStore();
      store.comments.push(
        comment({ id: "c2", createdAt: "2026-11-27T00:00:01.000Z" }),
        comment({ id: "c1" }),
        comment({ id: "c-other-thread", threadId: "t2" }),
        comment({ id: "c-other-map", sharedMapId: "m2" }),
      );

      expect(
        (await store.listCommentsByThread("m1", "t1")).map((c) => c.id),
      ).toEqual(["c1", "c2"]);
    });

    it("返した行を書き換えても中身に影響しない", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());

      const [listed] = await store.listThreadsByMap("m1");
      listed.status = "resolved";

      expect(store.threads[0].status).toBe("open");
    });
  });

  describe("insertThreadWithinLimits", () => {
    it("上限内なら追加して true", async () => {
      const store = createMemoryShareCommentStore();

      await expect(store.insertThreadWithinLimits(thread())).resolves.toBe(
        true,
      );
      expect(store.threads).toEqual([thread()]);
    });

    it("マップのスレッド数が上限なら false（別のマップは数えない）", async () => {
      const store = createMemoryShareCommentStore();
      for (let i = 0; i < SHARE_COMMENT_MAX_THREADS_PER_MAP; i += 1) {
        store.threads.push(thread({ id: `t-${i}` }));
      }
      store.threads.push(thread({ id: "t-other", sharedMapId: "m2" }));

      await expect(
        store.insertThreadWithinLimits(thread({ id: "t-new" })),
      ).resolves.toBe(false);
      await expect(
        store.insertThreadWithinLimits(
          thread({ id: "t-new-m2", sharedMapId: "m2" }),
        ),
      ).resolves.toBe(true);
    });

    it("マップのコメント数が上限なら false", async () => {
      const store = createMemoryShareCommentStore();
      for (let i = 0; i < SHARE_COMMENT_MAX_COMMENTS_PER_MAP; i += 1) {
        store.comments.push(comment({ id: `c-${i}`, threadId: `t-${i}` }));
      }

      await expect(
        store.insertThreadWithinLimits(thread({ id: "t-new" })),
      ).resolves.toBe(false);
      expect(store.threads).toEqual([]);
    });

    it("主キーの重複は D1QueryError(failed)", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());

      await expectKind(store.insertThreadWithinLimits(thread()), "failed");
    });

    it("上限到達かつ ID 重複なら false（D1 は WHERE が偽なら重複でも changes 0）", async () => {
      const store = createMemoryShareCommentStore();
      for (let i = 0; i < SHARE_COMMENT_MAX_THREADS_PER_MAP; i += 1) {
        store.threads.push(thread({ id: `t-${i}` }));
      }

      await expect(
        store.insertThreadWithinLimits(thread({ id: "t-0" })),
      ).resolves.toBe(false);
    });
  });

  describe("insertCommentWithinLimits", () => {
    it("同じマップの open スレッドがあり上限内なら追加して true", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());

      await expect(store.insertCommentWithinLimits(comment())).resolves.toBe(
        true,
      );
      expect(store.comments).toEqual([comment()]);
    });

    it("スレッドが無い・別のマップ・resolved なら false", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(
        thread({ id: "t-other-map", sharedMapId: "m2" }),
        thread({
          id: "t-resolved",
          status: "resolved",
          resolvedByUserId: "sub-2",
          resolvedByName: "解決者",
          resolvedAt: "2026-11-27T01:00:00.000Z",
        }),
      );

      await expect(
        store.insertCommentWithinLimits(comment({ threadId: "missing" })),
      ).resolves.toBe(false);
      await expect(
        store.insertCommentWithinLimits(comment({ threadId: "t-other-map" })),
      ).resolves.toBe(false);
      await expect(
        store.insertCommentWithinLimits(comment({ threadId: "t-resolved" })),
      ).resolves.toBe(false);
      expect(store.comments).toEqual([]);
    });

    it("スレッド内のコメント数が上限なら false", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      for (let i = 0; i < SHARE_COMMENT_MAX_COMMENTS_PER_THREAD; i += 1) {
        store.comments.push(comment({ id: `c-${i}` }));
      }

      await expect(
        store.insertCommentWithinLimits(comment({ id: "c-new" })),
      ).resolves.toBe(false);
    });

    it("マップのコメント数が上限なら false", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      for (let i = 0; i < SHARE_COMMENT_MAX_COMMENTS_PER_MAP; i += 1) {
        store.comments.push(comment({ id: `c-${i}`, threadId: `t-${i}` }));
      }

      await expect(
        store.insertCommentWithinLimits(comment({ id: "c-new" })),
      ).resolves.toBe(false);
    });

    it("主キーの重複は D1QueryError(failed)", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      store.comments.push(comment());

      await expectKind(store.insertCommentWithinLimits(comment()), "failed");
    });

    it("スレッドが resolved かつ ID 重複なら false（D1 は WHERE が偽なら重複でも changes 0）", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(
        thread({
          status: "resolved",
          resolvedByUserId: "sub-2",
          resolvedByName: "解決者",
          resolvedAt: "2026-11-27T01:00:00.000Z",
        }),
      );
      store.comments.push(comment());

      await expect(store.insertCommentWithinLimits(comment())).resolves.toBe(
        false,
      );
    });

    it("スレッド内の上限到達かつ ID 重複なら false", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      for (let i = 0; i < SHARE_COMMENT_MAX_COMMENTS_PER_THREAD; i += 1) {
        store.comments.push(comment({ id: `c-${i}` }));
      }

      await expect(
        store.insertCommentWithinLimits(comment({ id: "c-0" })),
      ).resolves.toBe(false);
    });
  });

  describe("解決と再開", () => {
    it("resolveThread は open のときだけ解決して 1、それ以外は 0", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      const resolved = {
        userId: "sub-2",
        name: "解決者",
        at: "2026-11-27T02:00:00.000Z",
      };

      await expect(store.resolveThread("m2", "t1", resolved)).resolves.toBe(0);
      await expect(store.resolveThread("m1", "t1", resolved)).resolves.toBe(1);
      expect(store.threads[0]).toEqual(
        thread({
          status: "resolved",
          resolvedByUserId: "sub-2",
          resolvedByName: "解決者",
          resolvedAt: "2026-11-27T02:00:00.000Z",
          updatedAt: "2026-11-27T02:00:00.000Z",
        }),
      );
      await expect(
        store.resolveThread("m1", "t1", {
          userId: "sub-3",
          name: "別人",
          at: "later",
        }),
      ).resolves.toBe(0);
      expect(store.threads[0].resolvedByName).toBe("解決者");
    });

    it("reopenThread は resolved のときだけ resolved_* を null にして 1、それ以外は 0", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(
        thread({
          status: "resolved",
          resolvedByUserId: "sub-2",
          resolvedByName: "解決者",
          resolvedAt: "2026-11-27T02:00:00.000Z",
        }),
      );

      await expect(
        store.reopenThread("m2", "t1", "2026-11-27T03:00:00.000Z"),
      ).resolves.toBe(0);
      await expect(
        store.reopenThread("m1", "t1", "2026-11-27T03:00:00.000Z"),
      ).resolves.toBe(1);
      expect(store.threads[0]).toEqual(
        thread({ updatedAt: "2026-11-27T03:00:00.000Z" }),
      );
      await expect(store.reopenThread("m1", "t1", "later")).resolves.toBe(0);
    });
  });

  describe("削除", () => {
    it("deleteComment は同じマップの行だけ消して changes を返す", async () => {
      const store = createMemoryShareCommentStore();
      store.comments.push(comment());

      await expect(store.deleteComment("m2", "c1")).resolves.toBe(0);
      await expect(store.deleteComment("m1", "c1")).resolves.toBe(1);
      await expect(store.deleteComment("m1", "c1")).resolves.toBe(0);
      expect(store.comments).toEqual([]);
    });

    it("deleteThreadIfEmpty は同じマップのコメントが残っていれば消さない", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      store.comments.push(comment());

      await expect(store.deleteThreadIfEmpty("m1", "t1")).resolves.toBe(0);
      store.comments.splice(
        0,
        store.comments.length,
        comment({ sharedMapId: "m2" }),
      );
      await expect(store.deleteThreadIfEmpty("m2", "t1")).resolves.toBe(0);
      await expect(store.deleteThreadIfEmpty("m1", "t1")).resolves.toBe(1);
      expect(store.threads).toEqual([]);
    });

    it("deleteThread は同じマップのスレッドを消して changes を返す", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread());
      store.comments.push(comment());

      await expect(store.deleteThread("m2", "t1")).resolves.toBe(0);
      await expect(store.deleteThread("m1", "t1")).resolves.toBe(1);
      expect(store.threads).toEqual([]);
    });

    it("deleteCommentsByThread は同じマップのそのスレッドのコメントだけ消して changes を返す", async () => {
      const store = createMemoryShareCommentStore();
      store.comments.push(
        comment(),
        comment({ id: "c2" }),
        comment({ id: "c3", threadId: "t2" }),
        comment({ id: "c4", sharedMapId: "m2" }),
      );

      await expect(store.deleteCommentsByThread("m1", "t1")).resolves.toBe(2);
      expect(store.comments.map((c) => c.id)).toEqual(["c3", "c4"]);
    });

    it("deleteCommentsByMap / deleteThreadsByMap はそのマップの行だけ消す", async () => {
      const store = createMemoryShareCommentStore();
      store.threads.push(thread(), thread({ id: "t2", sharedMapId: "m2" }));
      store.comments.push(comment(), comment({ id: "c2", sharedMapId: "m2" }));

      await store.deleteCommentsByMap("m1");
      await store.deleteThreadsByMap("m1");

      expect(store.threads.map((t) => t.id)).toEqual(["t2"]);
      expect(store.comments.map((c) => c.id)).toEqual(["c2"]);
    });
  });

  describe("失敗の再現", () => {
    const calls: Array<
      [keyof ShareCommentStore, (store: ShareCommentStore) => Promise<unknown>]
    > = [
      ["listThreadsByMap", (s) => s.listThreadsByMap("m1")],
      ["listCommentsByMap", (s) => s.listCommentsByMap("m1")],
      ["getThread", (s) => s.getThread("m1", "t1")],
      ["getComment", (s) => s.getComment("m1", "c1")],
      ["listCommentsByThread", (s) => s.listCommentsByThread("m1", "t1")],
      [
        "insertThreadWithinLimits",
        (s) => s.insertThreadWithinLimits(thread({ id: "t9" })),
      ],
      [
        "insertCommentWithinLimits",
        (s) => s.insertCommentWithinLimits(comment({ id: "c9" })),
      ],
      [
        "resolveThread",
        (s) => s.resolveThread("m1", "t1", { userId: "u", name: "n", at: "a" }),
      ],
      ["reopenThread", (s) => s.reopenThread("m1", "t1", "a")],
      ["deleteComment", (s) => s.deleteComment("m1", "c1")],
      ["deleteThreadIfEmpty", (s) => s.deleteThreadIfEmpty("m1", "t1")],
      ["deleteThread", (s) => s.deleteThread("m1", "t1")],
      ["deleteCommentsByThread", (s) => s.deleteCommentsByThread("m1", "t1")],
      ["deleteCommentsByMap", (s) => s.deleteCommentsByMap("m1")],
      ["deleteThreadsByMap", (s) => s.deleteThreadsByMap("m1")],
    ];

    it.each(calls)(
      "missingTables なら %s は D1QueryError(no-such-table)",
      async (_name, call) => {
        const store = createMemoryShareCommentStore({ missingTables: true });

        await expectKind(call(store), "no-such-table");
      },
    );

    it.each(calls)(
      "failOnce の %s は次の 1 回だけ D1QueryError(failed)",
      async (name, call) => {
        const store = createMemoryShareCommentStore({ failOnce: [name] });
        store.threads.push(thread());
        store.comments.push(comment());

        await expectKind(call(store), "failed");
        // 2 回目は失敗しない（reject すればテストが落ちる）
        await call(store);
      },
    );

    it("failOnce は指定していないメソッドに影響しない", async () => {
      const store = createMemoryShareCommentStore({
        failOnce: ["deleteComment"],
      });
      store.threads.push(thread());

      await expect(store.insertCommentWithinLimits(comment())).resolves.toBe(
        true,
      );
      await expectKind(store.deleteComment("m1", "c1"), "failed");
      expect(store.comments).toEqual([comment()]);
      await expect(store.deleteComment("m1", "c1")).resolves.toBe(1);
    });
  });
});
