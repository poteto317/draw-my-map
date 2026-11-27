/** @jest-environment node */

import { createHash } from "node:crypto";
import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { ShareCommentsScope } from "@/domain/share/shareComment";
import {
  SHARE_COMMENT_MAX_COMMENTS_PER_MAP,
  SHARE_COMMENT_MAX_COMMENTS_PER_THREAD,
  SHARE_COMMENT_MAX_THREADS_PER_MAP,
} from "@/domain/share/shareCommentLimits";
import type { ShareCommenter, ShareSession } from "@/domain/share/shareSession";
import { tokenHash } from "@/domain/share/tokenHash";
import {
  createShareCommentService,
  type CommentAccess,
  type ShareCommentService,
} from "@/server/share/shareCommentService";
import type {
  ShareCommentRecord,
  ShareCommentStore,
  ShareCommentThreadRecord,
} from "@/server/share/shareCommentStore";
import { createShareService } from "@/server/share/shareService";
import type { ShareStore } from "@/server/share/shareStore";
import {
  createMemoryShareCommentStore,
  type MemoryShareCommentStore,
} from "@/server/share/testing/memoryShareCommentStore";
import { createMemoryShareStore } from "@/server/share/testing/memoryShareStore";
import { createTestNode } from "@/testing/createTestNode";

const SECRET = "test-token-secret";
const OWNER_ID = "sub-owner-0001";
const ALICE_ID = "sub-alice-0002";
const BOB_ID = "sub-bob-0003";
const OWNER_SESSION: ShareSession = {
  userId: OWNER_ID,
  email: "owner@example.com",
displayName: null,
};
const OTHER_SESSION: ShareSession = {
  userId: BOB_ID,
  email: "bob@example.com",
displayName: null,
};
const OWNER_COMMENTER: ShareCommenter = {
  userId: OWNER_ID,
  displayName: "所有者",
};
const ALICE: ShareCommenter = { userId: ALICE_ID, displayName: "Alice" };
const BOB: ShareCommenter = { userId: BOB_ID, displayName: "Bob" };

function documentJson(): string {
  return serializeMapDocument(
    createMapDocument(
      [
        createTestNode({ id: 1, parentId: null, label: "根\nノード" }),
        createTestNode({ id: 2, parentId: 1, label: "子" }),
      ],
      "manual",
    ),
  );
}

type SharedFixture = {
  sharedMapId: string;
  viewLinkId: string;
  viewToken: string;
  commentLinkId: string;
  commentToken: string;
};

type Fixture = {
  store: ShareStore;
  commentStore: MemoryShareCommentStore;
  mapA: SharedFixture;
  mapB: SharedFixture;
  /** 主体を指定してサービスを作る（テストごとに新しいインスタンス） */
  service(ctx: {
    session: ShareSession;
    commenter: ShareCommenter | null;
    commentStore?: ShareCommentStore;
    store?: ShareStore;
  }): ShareCommentService;
};

function clock(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `2026-11-27T00:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000Z`;
  };
}

async function shareMap(
  shareService: ReturnType<typeof createShareService>,
  localMapId: string,
): Promise<SharedFixture> {
  const created = await shareService.createShare(OWNER_SESSION, {
    localMapId,
    title: localMapId,
    documentJson: documentJson(),
  });
  if (!created.ok) throw new Error(`createShare failed: ${created.reason}`);
  const comment = await shareService.createLink(
    OWNER_SESSION,
    created.value.sharedMapId,
    {
      permission: "comment",
    },
  );
  if (!comment.ok) throw new Error(`createLink failed: ${comment.reason}`);
  return {
    sharedMapId: created.value.sharedMapId,
    viewLinkId: created.value.link.linkId,
    viewToken: created.value.link.token,
    commentLinkId: comment.value.linkId,
    commentToken: comment.value.token,
  };
}

async function setup(
  options: { commentStore?: MemoryShareCommentStore } = {},
): Promise<Fixture> {
  const store = createMemoryShareStore();
  const commentStore = options.commentStore ?? createMemoryShareCommentStore();
  let shareSeq = 0;
  const shareService = createShareService({
    store,
    commentStore,
    tokenSecret: SECRET,
    publicOrigin: "http://localhost:3000",
    nowIso: () => "2026-11-26T00:00:00.000Z",
    createId: () => `share-id-${++shareSeq}`,
    createToken: () => `token-${++shareSeq}`,
  });
  const mapA = await shareMap(shareService, "local-a");
  const mapB = await shareMap(shareService, "local-b");
  let idSeq = 0;
  const now = clock();
  return {
    store,
    commentStore,
    mapA,
    mapB,
    service: (ctx) =>
      createShareCommentService({
        store: ctx.store ?? store,
        commentStore: ctx.commentStore ?? commentStore,
        tokenSecret: SECRET,
        getSession: async () => ctx.session,
        getCommenter: async () => ctx.commenter,
        nowIso: now,
        createId: () => `c-${++idSeq}`,
      }),
  };
}

function ownerScope(f: SharedFixture): ShareCommentsScope {
  return { kind: "owner", sharedMapId: f.sharedMapId };
}

function tokenScope(f: SharedFixture): ShareCommentsScope {
  return { kind: "token", token: f.commentToken };
}

async function accessOf(
  service: ShareCommentService,
  scope: ShareCommentsScope,
  requireActor = true,
): Promise<CommentAccess> {
  const result = await service.resolveAccess(scope, { requireActor });
  if (!result.ok) throw new Error(`resolveAccess failed: ${result.reason}`);
  return result.value;
}

/** 主体ごとのトークン経路アクセス */
async function tokenAccess(
  fx: Fixture,
  commenter: ShareCommenter | null,
  map: SharedFixture = fx.mapA,
): Promise<{ service: ShareCommentService; access: CommentAccess }> {
  const service = fx.service({ session: null, commenter });
  return {
    service,
    access: await accessOf(service, tokenScope(map), commenter !== null),
  };
}

async function ownerAccess(
  fx: Fixture,
  map: SharedFixture = fx.mapA,
): Promise<{ service: ShareCommentService; access: CommentAccess }> {
  const service = fx.service({
    session: OWNER_SESSION,
    commenter: OWNER_COMMENTER,
  });
  return { service, access: await accessOf(service, ownerScope(map)) };
}

async function createThreadAs(
  fx: Fixture,
  commenter: ShareCommenter,
  input: { nodeId: number; body: string } = {
    nodeId: 1,
    body: "最初のコメント",
  },
  map: SharedFixture = fx.mapA,
) {
  const { service, access } = await tokenAccess(fx, commenter, map);
  const created = await service.createThread(access, input);
  if (!created.ok) throw new Error(`createThread failed: ${created.reason}`);
  return created.value;
}

function threadRecord(
  overrides: Partial<ShareCommentThreadRecord> & {
    id: string;
    sharedMapId: string;
  },
): ShareCommentThreadRecord {
  return {
    nodeId: 1,
    nodeLabelSnapshot: "根",
    status: "open",
    createdByUserId: ALICE_ID,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    resolvedByUserId: null,
    resolvedByName: null,
    resolvedAt: null,
    ...overrides,
  };
}

function commentRecord(
  overrides: Partial<ShareCommentRecord> & {
    id: string;
    threadId: string;
    sharedMapId: string;
  },
): ShareCommentRecord {
  return {
    authorUserId: ALICE_ID,
    authorName: "Alice",
    body: "本文",
    createdAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

function expectNoPrivateIdentifiers(value: unknown): void {
  const json = JSON.stringify(value);
  for (const secret of [OWNER_ID, ALICE_ID, BOB_ID, "@example.com"]) {
    expect(json).not.toContain(secret);
  }
}

describe("ShareCommentService.resolveAccess（所有者経路）", () => {
  it("所有者のセッションと一致する commenter なら isOwner・via owner・正規化済みの表示名", async () => {
    const fx = await setup();
    const service = fx.service({
      session: OWNER_SESSION,
      commenter: { userId: OWNER_ID, displayName: "  所有者\u0007  " },
    });
    const result = await service.resolveAccess(ownerScope(fx.mapA), {
      requireActor: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isOwner).toBe(true);
    expect(result.value.via).toBe("owner");
    expect(result.value.actor).toEqual({
      userId: OWNER_ID,
      displayName: "所有者",
    });
    expect(result.value.map.id).toBe(fx.mapA.sharedMapId);
  });

  it("表示名が無ければ「名前未設定」", async () => {
    const fx = await setup();
    const service = fx.service({
      session: OWNER_SESSION,
      commenter: { userId: OWNER_ID, displayName: null },
    });
    const access = await accessOf(service, ownerScope(fx.mapA));
    expect(access.actor?.displayName).toBe("名前未設定");
  });

  it("未ログインは unauthenticated（requireActor に関係なく）", async () => {
    const fx = await setup();
    const service = fx.service({ session: null, commenter: null });
    for (const requireActor of [true, false]) {
      expect(
        await service.resolveAccess(ownerScope(fx.mapA), { requireActor }),
      ).toEqual({
        ok: false,
        reason: "unauthenticated",
      });
    }
  });

  it("他人のマップ・存在しないマップは not-found", async () => {
    const fx = await setup();
    const service = fx.service({ session: OTHER_SESSION, commenter: BOB });
    expect(
      await service.resolveAccess(ownerScope(fx.mapA), { requireActor: false }),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
    const owner = fx.service({
      session: OWNER_SESSION,
      commenter: OWNER_COMMENTER,
    });
    expect(
      await owner.resolveAccess(
        { kind: "owner", sharedMapId: "missing" },
        { requireActor: false },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("getCommenter が null、または userId が食い違うと unauthenticated", async () => {
    const fx = await setup();
    for (const commenter of [null, ALICE]) {
      const service = fx.service({ session: OWNER_SESSION, commenter });
      expect(
        await service.resolveAccess(ownerScope(fx.mapA), {
          requireActor: false,
        }),
      ).toEqual({
        ok: false,
        reason: "unauthenticated",
      });
    }
  });

  it("ストアの例外は storage-error", async () => {
    const fx = await setup();
    const brokenStore: ShareStore = {
      ...fx.store,
      getMap: async () => {
        throw new Error("boom: secret detail");
      },
    };
    const service = fx.service({
      session: OWNER_SESSION,
      commenter: OWNER_COMMENTER,
      store: brokenStore,
    });
    expect(
      await service.resolveAccess(ownerScope(fx.mapA), { requireActor: true }),
    ).toEqual({
      ok: false,
      reason: "storage-error",
    });
  });
});

describe("ShareCommentService.resolveAccess（トークン経路）", () => {
  it("comment リンク・未ログインの一覧用アクセスは actor null・isOwner false", async () => {
    const fx = await setup();
    const service = fx.service({ session: null, commenter: null });
    const result = await service.resolveAccess(tokenScope(fx.mapA), {
      requireActor: false,
    });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        actor: null,
        isOwner: false,
        via: "token",
      }),
    });
  });

  it("comment リンク・未ログインの書込み用アクセスは unauthenticated", async () => {
    const fx = await setup();
    const service = fx.service({ session: null, commenter: null });
    expect(
      await service.resolveAccess(tokenScope(fx.mapA), { requireActor: true }),
    ).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("comment リンク・ログイン済みは actor を持ち、所有者なら isOwner", async () => {
    const fx = await setup();
    const alice = await accessOf(
      fx.service({ session: null, commenter: ALICE }),
      tokenScope(fx.mapA),
    );
    expect(alice.actor).toEqual({ userId: ALICE_ID, displayName: "Alice" });
    expect(alice.isOwner).toBe(false);
    const owner = await accessOf(
      fx.service({ session: null, commenter: OWNER_COMMENTER }),
      tokenScope(fx.mapA),
    );
    expect(owner.isOwner).toBe(true);
    expect(owner.via).toBe("token");
  });

  it("view リンクは所有者がログインしていても not-found（未ログインでも 401 にしない）", async () => {
    const fx = await setup();
    for (const commenter of [OWNER_COMMENTER, ALICE, null]) {
      const service = fx.service({ session: OWNER_SESSION, commenter });
      for (const requireActor of [true, false]) {
        expect(
          await service.resolveAccess(
            { kind: "token", token: fx.mapA.viewToken },
            { requireActor },
          ),
        ).toEqual({ ok: false, reason: "not-found" });
      }
    }
  });

  it("不明・空・失効のトークンは not-found", async () => {
    const fx = await setup();
    await fx.store.revokeLink(
      fx.mapA.commentLinkId,
      "2026-11-26T01:00:00.000Z",
    );
    const service = fx.service({ session: null, commenter: ALICE });
    for (const token of ["unknown", "", fx.mapA.commentToken]) {
      expect(
        await service.resolveAccess(
          { kind: "token", token },
          { requireActor: true },
        ),
      ).toEqual({
        ok: false,
        reason: "not-found",
      });
    }
  });

  it("未公開のマップは not-found", async () => {
    const fx = await setup();
    await fx.store.setCurrentRevision(
      fx.mapA.sharedMapId,
      null,
      "2026-11-26T01:00:00.000Z",
    );
    const service = fx.service({ session: null, commenter: ALICE });
    expect(
      await service.resolveAccess(tokenScope(fx.mapA), { requireActor: false }),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("edit リンクはコメント経路では not-found（permission は漏らない）", async () => {
    const fx = await setup();
    await fx.store.insertLink({
      id: "link-edit",
      sharedMapId: fx.mapA.sharedMapId,
      tokenHash: tokenHash("edit-token", SECRET),
      permission: "edit",
      createdAt: "2026-11-26T00:00:00.000Z",
      revokedAt: null,
      expiresAt: null,
    });
    const service = fx.service({ session: null, commenter: OWNER_COMMENTER });
    expect(
      await service.resolveAccess(
        { kind: "token", token: "edit-token" },
        { requireActor: false },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("未知の permission のリンクは not-found", async () => {
    const fx = await setup();
    await fx.store.insertLink({
      id: "link-admin",
      sharedMapId: fx.mapA.sharedMapId,
      tokenHash: tokenHash("admin-token", SECRET),
      permission: "admin",
      createdAt: "2026-11-26T00:00:00.000Z",
      revokedAt: null,
      expiresAt: null,
    });
    const service = fx.service({ session: null, commenter: OWNER_COMMENTER });
    expect(
      await service.resolveAccess(
        { kind: "token", token: "admin-token" },
        { requireActor: false },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("ShareCommentService.list", () => {
  it("スレッドとコメントをまとめ、閲覧者ごとの能力と viewer を返す", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const bob = await tokenAccess(fx, BOB);
    const replied = await bob.service.reply(bob.access, thread.id, {
      body: "返信",
    });
    expect(replied.ok).toBe(true);

    const asAlice = await tokenAccess(fx, ALICE);
    const aliceList = await asAlice.service.list(asAlice.access);
    expect(aliceList).toEqual({
      ok: true,
      value: {
        viewer: { signedIn: true, canPost: true, isOwner: false },
        threads: [
          expect.objectContaining({
            id: thread.id,
            nodeId: 1,
            nodeLabelSnapshot: "根 ノード",
            status: "open",
            canResolve: true,
            comments: [
              expect.objectContaining({
                authorName: "Alice",
                body: "最初のコメント",
                canDelete: true,
              }),
              expect.objectContaining({
                authorName: "Bob",
                body: "返信",
                canDelete: false,
              }),
            ],
          }),
        ],
      },
    });

    const bobList = await bob.service.list(bob.access);
    expect(bobList.ok && bobList.value.threads[0].canResolve).toBe(false);
    expect(
      bobList.ok && bobList.value.threads[0].comments.map((c) => c.canDelete),
    ).toEqual([false, true]);

    const owner = await ownerAccess(fx);
    const ownerList = await owner.service.list(owner.access);
    expect(ownerList.ok && ownerList.value.viewer).toEqual({
      signedIn: true,
      canPost: true,
      isOwner: true,
    });
    expect(ownerList.ok && ownerList.value.threads[0].canResolve).toBe(true);
    expect(
      ownerList.ok &&
        ownerList.value.threads[0].comments.map((c) => c.canDelete),
    ).toEqual([true, true]);
  });

  it("未ログインは viewer.signedIn=false・canPost=false で、能力はすべて false", async () => {
    const fx = await setup();
    await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, null);
    const result = await service.list(access);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.viewer).toEqual({
      signedIn: false,
      canPost: false,
      isOwner: false,
    });
    expect(result.value.threads[0].canResolve).toBe(false);
    expect(result.value.threads[0].comments[0].canDelete).toBe(false);
  });

  it("コメント 0 件のスレッドとスレッドの無いコメントは返さない", async () => {
    const commentStore = createMemoryShareCommentStore({
      failOnce: ["insertCommentWithinLimits", "deleteThread"],
    });
    const fx = await setup({ commentStore });
    const { service, access } = await tokenAccess(fx, ALICE);
    const failed = await service.createThread(access, {
      nodeId: 1,
      body: "失敗する",
    });
    expect(failed).toEqual({ ok: false, reason: "storage-error" });
    expect(commentStore.threads).toHaveLength(1);
    commentStore.comments.push(
      commentRecord({
        id: "orphan",
        threadId: "no-thread",
        sharedMapId: fx.mapA.sharedMapId,
      }),
    );

    const result = await service.list(access);
    expect(result).toEqual({
      ok: true,
      value: {
        threads: [],
        viewer: { signedIn: true, canPost: true, isOwner: false },
      },
    });
  });

  it("別マップのスレッドは含めない", async () => {
    const fx = await setup();
    await createThreadAs(fx, ALICE, undefined, fx.mapB);
    const { service, access } = await tokenAccess(fx, ALICE);
    const result = await service.list(access);
    expect(result.ok && result.value.threads).toEqual([]);
  });

  it("応答に投稿者の userId とメールを含めない", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const owner = await ownerAccess(fx);
    await owner.service.resolveThread(owner.access, thread.id);
    const result = await owner.service.list(owner.access);
    expect(result.ok).toBe(true);
    expectNoPrivateIdentifiers(result);
  });

  it("ストアの例外は storage-error", async () => {
    const commentStore = createMemoryShareCommentStore({
      failOnce: ["listCommentsByMap"],
    });
    const fx = await setup({ commentStore });
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(await service.list(access)).toEqual({
      ok: false,
      reason: "storage-error",
    });
  });
});

describe("ShareCommentService.createThread", () => {
  it("スレッドと最初のコメントを作り、読み直した View を返す", async () => {
    const fx = await setup();
    const { service, access } = await tokenAccess(fx, ALICE);
    const result = await service.createThread(access, {
      nodeId: 1,
      body: "  最初の\r\nコメント  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: expect.any(String),
      nodeId: 1,
      nodeLabelSnapshot: "根 ノード",
      status: "open",
      resolvedByName: null,
      resolvedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      canResolve: true,
      comments: [
        {
          id: expect.any(String),
          authorName: "Alice",
          body: "最初の\nコメント",
          createdAt: expect.any(String),
          canDelete: true,
        },
      ],
    });
    expectNoPrivateIdentifiers(result);
    expect(fx.commentStore.threads).toEqual([
      expect.objectContaining({
        sharedMapId: fx.mapA.sharedMapId,
        createdByUserId: ALICE_ID,
        nodeId: 1,
      }),
    ]);
    expect(fx.commentStore.comments).toEqual([
      expect.objectContaining({ authorUserId: ALICE_ID, authorName: "Alice" }),
    ]);
  });

  it("所有者経路でも作れる（作成者は所有者）", async () => {
    const fx = await setup();
    const { service, access } = await ownerAccess(fx);
    const result = await service.createThread(access, {
      nodeId: 2,
      body: "所有者から",
    });
    expect(result.ok && result.value.comments[0].authorName).toBe("所有者");
    expect(fx.commentStore.threads[0].createdByUserId).toBe(OWNER_ID);
  });

  it("actor が無ければ unauthenticated", async () => {
    const fx = await setup();
    const { service, access } = await tokenAccess(fx, null);
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(fx.commentStore.threads).toHaveLength(0);
  });

  it.each(["", "   \n  ", "a".repeat(2001)])(
    "本文 %#: invalid-comment",
    async (body) => {
      const fx = await setup();
      const { service, access } = await tokenAccess(fx, ALICE);
      expect(await service.createThread(access, { nodeId: 1, body })).toEqual({
        ok: false,
        reason: "invalid-comment",
      });
      expect(fx.commentStore.threads).toHaveLength(0);
    },
  );

  it("文書に無いノードは invalid-node", async () => {
    const fx = await setup();
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(
      await service.createThread(access, { nodeId: 99, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "invalid-node",
    });
    expect(fx.commentStore.threads).toHaveLength(0);
  });

  it("未公開のマップ（所有者経路）は not-published", async () => {
    const fx = await setup();
    const { service, access } = await ownerAccess(fx);
    await fx.store.setCurrentRevision(
      fx.mapA.sharedMapId,
      null,
      "2026-11-26T01:00:00.000Z",
    );
    const unpublished = await accessOf(service, ownerScope(fx.mapA));
    expect(access.map.currentRevisionId).not.toBeNull();
    expect(
      await service.createThread(unpublished, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "not-published",
    });
  });

  it("文書を解釈できなければ storage-error", async () => {
    const fx = await setup();
    const body = new TextEncoder().encode('{"not":"a map"}');
    await fx.store.putDocument("broken.json", body);
    await fx.store.insertRevision({
      id: "rev-broken",
      sharedMapId: fx.mapA.sharedMapId,
      r2Key: "broken.json",
      byteSize: body.byteLength,
      contentSha256: createHash("sha256").update(body).digest("hex"),
      publishedAt: "2026-11-26T01:00:00.000Z",
    });
    await fx.store.setCurrentRevision(
      fx.mapA.sharedMapId,
      "rev-broken",
      "2026-11-26T01:00:00.000Z",
    );
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "storage-error",
    });
    expect(fx.commentStore.threads).toHaveLength(0);
  });

  it(`マップのスレッドが ${SHARE_COMMENT_MAX_THREADS_PER_MAP} 件なら comment-limit`, async () => {
    const fx = await setup();
    for (let i = 0; i < SHARE_COMMENT_MAX_THREADS_PER_MAP; i += 1) {
      fx.commentStore.threads.push(
        threadRecord({ id: `t-${i}`, sharedMapId: fx.mapA.sharedMapId }),
      );
    }
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "comment-limit",
    });
    expect(fx.commentStore.threads).toHaveLength(
      SHARE_COMMENT_MAX_THREADS_PER_MAP,
    );
  });

  it(`マップのコメントが ${SHARE_COMMENT_MAX_COMMENTS_PER_MAP} 件なら comment-limit`, async () => {
    const fx = await setup();
    fx.commentStore.threads.push(
      threadRecord({ id: "t-full", sharedMapId: fx.mapA.sharedMapId }),
    );
    for (let i = 0; i < SHARE_COMMENT_MAX_COMMENTS_PER_MAP; i += 1) {
      fx.commentStore.comments.push(
        commentRecord({
          id: `m-${i}`,
          threadId: "t-full",
          sharedMapId: fx.mapA.sharedMapId,
        }),
      );
    }
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "comment-limit",
    });
    expect(fx.commentStore.threads).toHaveLength(1);
  });

  it("最初のコメントの INSERT が例外ならスレッドを補償削除して storage-error", async () => {
    const commentStore = createMemoryShareCommentStore({
      failOnce: ["insertCommentWithinLimits"],
    });
    const fx = await setup({ commentStore });
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "storage-error",
    });
    expect(commentStore.threads).toHaveLength(0);
    expect(commentStore.comments).toHaveLength(0);
  });

  it("最初のコメントの INSERT が例外でも行が入っていれば、補償でコメントもスレッドも消して storage-error", async () => {
    const fx = await setup();
    const ambiguous: ShareCommentStore = {
      ...fx.commentStore,
      insertCommentWithinLimits: async (row) => {
        // D1 側では commit 済みだが応答がタイムアウトした状況を再現する
        await fx.commentStore.insertCommentWithinLimits(row);
        throw new Error("timeout");
      },
    };
    const service = fx.service({
      session: null,
      commenter: ALICE,
      commentStore: ambiguous,
    });
    const access = await accessOf(service, tokenScope(fx.mapA));
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "storage-error",
    });
    expect(fx.commentStore.comments).toHaveLength(0);
    expect(fx.commentStore.threads).toHaveLength(0);
  });

  it("補償でコメントの削除が失敗したらスレッドは消さない（孤児コメントを作らない）", async () => {
    const fx = await setup();
    const ambiguous: ShareCommentStore = {
      ...fx.commentStore,
      insertCommentWithinLimits: async (row) => {
        await fx.commentStore.insertCommentWithinLimits(row);
        throw new Error("timeout");
      },
      deleteCommentsByThread: async () => {
        throw new Error("boom");
      },
    };
    const service = fx.service({
      session: null,
      commenter: ALICE,
      commentStore: ambiguous,
    });
    const access = await accessOf(service, tokenScope(fx.mapA));
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "storage-error",
    });
    expect(fx.commentStore.comments).toHaveLength(1);
    expect(fx.commentStore.threads).toHaveLength(1);
  });

  it("最初のコメントの INSERT が上限で false ならスレッドを補償削除して comment-limit", async () => {
    const fx = await setup();
    const rejecting: ShareCommentStore = {
      ...fx.commentStore,
      insertCommentWithinLimits: async () => false,
    };
    const service = fx.service({
      session: null,
      commenter: ALICE,
      commentStore: rejecting,
    });
    const access = await accessOf(service, tokenScope(fx.mapA));
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "comment-limit",
    });
    expect(fx.commentStore.threads).toHaveLength(0);
  });

  it("補償の失敗は握りつぶして同じ reason を返す", async () => {
    const fx = await setup();
    const rejecting: ShareCommentStore = {
      ...fx.commentStore,
      insertCommentWithinLimits: async () => false,
      deleteThread: async () => {
        throw new Error("boom");
      },
    };
    const service = fx.service({
      session: null,
      commenter: ALICE,
      commentStore: rejecting,
    });
    const access = await accessOf(service, tokenScope(fx.mapA));
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "comment-limit",
    });
  });

  it("スレッドの INSERT の例外は storage-error", async () => {
    const commentStore = createMemoryShareCommentStore({
      failOnce: ["insertThreadWithinLimits"],
    });
    const fx = await setup({ commentStore });
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(
      await service.createThread(access, { nodeId: 1, body: "x" }),
    ).toEqual({
      ok: false,
      reason: "storage-error",
    });
  });
});

describe("ShareCommentService.reply", () => {
  it("open のスレッドへ返信し、読み直した View を返す", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, BOB);
    const result = await service.reply(access, thread.id, { body: " 返信 " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(thread.id);
    expect(result.value.canResolve).toBe(false);
    expect(
      result.value.comments.map((c) => [c.authorName, c.body, c.canDelete]),
    ).toEqual([
      ["Alice", "最初のコメント", false],
      ["Bob", "返信", true],
    ]);
    expectNoPrivateIdentifiers(result);
  });

  it("actor が無ければ unauthenticated", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, null);
    expect(await service.reply(access, thread.id, { body: "x" })).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("本文が不正なら invalid-comment", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, BOB);
    expect(await service.reply(access, thread.id, { body: "  " })).toEqual({
      ok: false,
      reason: "invalid-comment",
    });
  });

  it("存在しないスレッドは not-found", async () => {
    const fx = await setup();
    const { service, access } = await tokenAccess(fx, BOB);
    expect(await service.reply(access, "missing", { body: "x" })).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("解決済みのスレッドは thread-resolved", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const alice = await tokenAccess(fx, ALICE);
    await alice.service.resolveThread(alice.access, thread.id);
    const { service, access } = await tokenAccess(fx, BOB);
    expect(await service.reply(access, thread.id, { body: "x" })).toEqual({
      ok: false,
      reason: "thread-resolved",
    });
  });

  it(`スレッドのコメントが ${SHARE_COMMENT_MAX_COMMENTS_PER_THREAD} 件なら comment-limit`, async () => {
    const fx = await setup();
    fx.commentStore.threads.push(
      threadRecord({ id: "t-full", sharedMapId: fx.mapA.sharedMapId }),
    );
    for (let i = 0; i < SHARE_COMMENT_MAX_COMMENTS_PER_THREAD; i += 1) {
      fx.commentStore.comments.push(
        commentRecord({
          id: `m-${i}`,
          threadId: "t-full",
          sharedMapId: fx.mapA.sharedMapId,
        }),
      );
    }
    const { service, access } = await tokenAccess(fx, BOB);
    expect(await service.reply(access, "t-full", { body: "x" })).toEqual({
      ok: false,
      reason: "comment-limit",
    });
  });

  it(`マップのコメントが ${SHARE_COMMENT_MAX_COMMENTS_PER_MAP} 件なら comment-limit`, async () => {
    const fx = await setup();
    fx.commentStore.threads.push(
      threadRecord({ id: "t-open", sharedMapId: fx.mapA.sharedMapId }),
    );
    fx.commentStore.threads.push(
      threadRecord({ id: "t-bulk", sharedMapId: fx.mapA.sharedMapId }),
    );
    fx.commentStore.comments.push(
      commentRecord({
        id: "first",
        threadId: "t-open",
        sharedMapId: fx.mapA.sharedMapId,
      }),
    );
    for (let i = 0; i < SHARE_COMMENT_MAX_COMMENTS_PER_MAP - 1; i += 1) {
      fx.commentStore.comments.push(
        commentRecord({
          id: `m-${i}`,
          threadId: "t-bulk",
          sharedMapId: fx.mapA.sharedMapId,
        }),
      );
    }
    const { service, access } = await tokenAccess(fx, BOB);
    expect(await service.reply(access, "t-open", { body: "x" })).toEqual({
      ok: false,
      reason: "comment-limit",
    });
  });

  it("ストアの例外は storage-error", async () => {
    const commentStore = createMemoryShareCommentStore();
    const fx = await setup({ commentStore });
    const thread = await createThreadAs(fx, ALICE);
    const failing: ShareCommentStore = {
      ...commentStore,
      insertCommentWithinLimits: async () => {
        throw new Error("boom");
      },
    };
    const service = fx.service({
      session: null,
      commenter: BOB,
      commentStore: failing,
    });
    const access = await accessOf(service, tokenScope(fx.mapA));
    expect(await service.reply(access, thread.id, { body: "x" })).toEqual({
      ok: false,
      reason: "storage-error",
    });
  });
});

describe("ShareCommentService.resolveThread / reopenThread", () => {
  it("作成者は解決・再開でき、解決者名は actor の表示名", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, ALICE);

    const resolved = await service.resolveThread(access, thread.id);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.status).toBe("resolved");
    expect(resolved.value.resolvedByName).toBe("Alice");
    expect(resolved.value.resolvedAt).toEqual(expect.any(String));
    expect(fx.commentStore.threads[0].resolvedByUserId).toBe(ALICE_ID);
    expectNoPrivateIdentifiers(resolved);

    const reopened = await service.reopenThread(access, thread.id);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.status).toBe("open");
    expect(reopened.value.resolvedByName).toBeNull();
    expect(reopened.value.resolvedAt).toBeNull();
  });

  it("所有者は他人のスレッドを解決・再開できる（どちらの経路でも）", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const owner = await ownerAccess(fx);
    const resolved = await owner.service.resolveThread(owner.access, thread.id);
    expect(resolved.ok && resolved.value.resolvedByName).toBe("所有者");

    const viaToken = await tokenAccess(fx, OWNER_COMMENTER);
    const reopened = await viaToken.service.reopenThread(
      viaToken.access,
      thread.id,
    );
    expect(reopened.ok && reopened.value.status).toBe("open");
  });

  it("作成者でも所有者でもなければ not-found で、状態は変わらない", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, BOB);
    expect(await service.resolveThread(access, thread.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(fx.commentStore.threads[0].status).toBe("open");

    const alice = await tokenAccess(fx, ALICE);
    await alice.service.resolveThread(alice.access, thread.id);
    expect(await service.reopenThread(access, thread.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(fx.commentStore.threads[0].status).toBe("resolved");
  });

  it("actor が無ければ unauthenticated", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, null);
    expect(await service.resolveThread(access, thread.id)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await service.reopenThread(access, thread.id)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("存在しないスレッドは not-found", async () => {
    const fx = await setup();
    const { service, access } = await ownerAccess(fx);
    expect(await service.resolveThread(access, "missing")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await service.reopenThread(access, "missing")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("解決済みの解決は成功（冪等）で、解決者を上書きしない", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const alice = await tokenAccess(fx, ALICE);
    const first = await alice.service.resolveThread(alice.access, thread.id);
    expect(first.ok).toBe(true);

    const owner = await ownerAccess(fx);
    const second = await owner.service.resolveThread(owner.access, thread.id);
    expect(second.ok).toBe(true);
    if (!second.ok || !first.ok) return;
    expect(second.value.resolvedByName).toBe("Alice");
    expect(second.value.resolvedAt).toBe(first.value.resolvedAt);
    expect(fx.commentStore.threads[0].resolvedByUserId).toBe(ALICE_ID);
  });

  it("open の再開は成功（冪等）", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, ALICE);
    const result = await service.reopenThread(access, thread.id);
    expect(result.ok && result.value.status).toBe("open");
    expect(result.ok && result.value.updatedAt).toBe(thread.updatedAt);
  });

  it("能力判定の後にスレッドが消えたら not-found", async () => {
    for (const operation of ["resolveThread", "reopenThread"] as const) {
      const fx = await setup();
      const thread = await createThreadAs(fx, ALICE);
      const vanishing: ShareCommentStore = {
        ...fx.commentStore,
        getThread: async (sharedMapId, threadId) => {
          const found = await fx.commentStore.getThread(sharedMapId, threadId);
          fx.commentStore.threads.splice(0, fx.commentStore.threads.length);
          return found;
        },
      };
      const service = fx.service({
        session: null,
        commenter: ALICE,
        commentStore: vanishing,
      });
      const access = await accessOf(service, tokenScope(fx.mapA));
      expect(await service[operation](access, thread.id)).toEqual({
        ok: false,
        reason: "not-found",
      });
    }
  });

  it("ストアの例外は storage-error", async () => {
    for (const failing of ["getThread", "resolveThread"] as const) {
      const fx = await setup();
      const thread = await createThreadAs(fx, ALICE);
      const broken: ShareCommentStore = {
        ...fx.commentStore,
        [failing]: async () => {
          throw new Error("boom");
        },
      };
      const service = fx.service({
        session: null,
        commenter: ALICE,
        commentStore: broken,
      });
      const access = await accessOf(service, tokenScope(fx.mapA));
      expect(await service.resolveThread(access, thread.id)).toEqual({
        ok: false,
        reason: "storage-error",
      });
      expect(fx.commentStore.threads[0].status).toBe("open");
    }
  });
});

describe("ShareCommentService.deleteComment", () => {
  it("投稿者は自分のコメントを消せる。残りがあれば threadDeleted: false", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const bob = await tokenAccess(fx, BOB);
    const replied = await bob.service.reply(bob.access, thread.id, {
      body: "返信",
    });
    if (!replied.ok) throw new Error("reply failed");
    const replyId = replied.value.comments[1].id;

    expect(await bob.service.deleteComment(bob.access, replyId)).toEqual({
      ok: true,
      value: { commentId: replyId, threadDeleted: false },
    });
    expect(fx.commentStore.comments.map((c) => c.id)).toEqual([
      thread.comments[0].id,
    ]);
    expect(fx.commentStore.threads).toHaveLength(1);
  });

  it("最後のコメントを消すとスレッドも消え threadDeleted: true", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(await service.deleteComment(access, thread.comments[0].id)).toEqual({
      ok: true,
      value: { commentId: thread.comments[0].id, threadDeleted: true },
    });
    expect(fx.commentStore.threads).toHaveLength(0);
  });

  it("所有者は他人のコメントを消せる", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await ownerAccess(fx);
    const result = await service.deleteComment(access, thread.comments[0].id);
    expect(result.ok).toBe(true);
    expect(fx.commentStore.comments).toHaveLength(0);
  });

  it("投稿者でも所有者でもなければ not-found で、行は残る（スレッド作成者でも）", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const bob = await tokenAccess(fx, BOB);
    const replied = await bob.service.reply(bob.access, thread.id, {
      body: "返信",
    });
    if (!replied.ok) throw new Error("reply failed");

    expect(
      await bob.service.deleteComment(bob.access, thread.comments[0].id),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
    const alice = await tokenAccess(fx, ALICE);
    expect(
      await alice.service.deleteComment(
        alice.access,
        replied.value.comments[1].id,
      ),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(fx.commentStore.comments).toHaveLength(2);
  });

  it("actor が無ければ unauthenticated", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, null);
    expect(await service.deleteComment(access, thread.comments[0].id)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("存在しないコメントは not-found", async () => {
    const fx = await setup();
    const { service, access } = await ownerAccess(fx);
    expect(await service.deleteComment(access, "missing")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("能力判定の後にコメントが消えたら not-found", async () => {
    const fx = await setup();
    const thread = await createThreadAs(fx, ALICE);
    const vanishing: ShareCommentStore = {
      ...fx.commentStore,
      getComment: async (sharedMapId, commentId) => {
        const found = await fx.commentStore.getComment(sharedMapId, commentId);
        fx.commentStore.comments.splice(0, fx.commentStore.comments.length);
        return found;
      },
    };
    const service = fx.service({
      session: null,
      commenter: ALICE,
      commentStore: vanishing,
    });
    const access = await accessOf(service, tokenScope(fx.mapA));
    expect(await service.deleteComment(access, thread.comments[0].id)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("空スレッドの後始末が失敗しても threadDeleted: false で成功", async () => {
    const commentStore = createMemoryShareCommentStore({
      failOnce: ["deleteThreadIfEmpty"],
    });
    const fx = await setup({ commentStore });
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(await service.deleteComment(access, thread.comments[0].id)).toEqual({
      ok: true,
      value: { commentId: thread.comments[0].id, threadDeleted: false },
    });
    expect(commentStore.comments).toHaveLength(0);
    const listed = await service.list(access);
    expect(listed.ok && listed.value.threads).toEqual([]);
  });

  it("コメント削除の例外は storage-error", async () => {
    const commentStore = createMemoryShareCommentStore({
      failOnce: ["deleteComment"],
    });
    const fx = await setup({ commentStore });
    const thread = await createThreadAs(fx, ALICE);
    const { service, access } = await tokenAccess(fx, ALICE);
    expect(await service.deleteComment(access, thread.comments[0].id)).toEqual({
      ok: false,
      reason: "storage-error",
    });
    expect(commentStore.comments).toHaveLength(1);
  });
});

describe("ShareCommentService 別マップの ID", () => {
  it.each(["owner", "token"] as const)(
    "マップ A の access（%s 経路）でマップ B のスレッド・コメントに触れると not-found で、B は変わらない",
    async (via) => {
      const fx = await setup();
      const threadB = await createThreadAs(
        fx,
        OWNER_COMMENTER,
        undefined,
        fx.mapB,
      );
      const commentBId = threadB.comments[0].id;
      const before = JSON.stringify({
        threads: fx.commentStore.threads,
        comments: fx.commentStore.comments,
      });

      const { service, access } =
        via === "owner"
          ? await ownerAccess(fx)
          : await tokenAccess(fx, OWNER_COMMENTER);
      expect(access.map.id).toBe(fx.mapA.sharedMapId);

      expect(await service.reply(access, threadB.id, { body: "x" })).toEqual({
        ok: false,
        reason: "not-found",
      });
      expect(await service.resolveThread(access, threadB.id)).toEqual({
        ok: false,
        reason: "not-found",
      });
      expect(await service.reopenThread(access, threadB.id)).toEqual({
        ok: false,
        reason: "not-found",
      });
      expect(await service.deleteComment(access, commentBId)).toEqual({
        ok: false,
        reason: "not-found",
      });
      expect(
        JSON.stringify({
          threads: fx.commentStore.threads,
          comments: fx.commentStore.comments,
        }),
      ).toBe(before);
    },
  );
});
