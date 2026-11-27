/** @jest-environment node */

import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { ShareCommentsScope } from "@/domain/share/shareComment";
import {
  SHARE_COMMENT_MAX_BODY_BYTES,
  SHARE_COMMENT_MAX_THREADS_PER_MAP,
} from "@/domain/share/shareCommentLimits";
import type { ShareCommenter, ShareSession } from "@/domain/share/shareSession";
import type { ShareApiDeps } from "@/server/share/handleShareApi";
import {
  handleCreateCommentThread,
  handleDeleteComment,
  handleListCommentThreads,
  handleReopenCommentThread,
  handleReplyCommentThread,
  handleResolveCommentThread,
} from "@/server/share/handleShareCommentsApi";
import {
  createShareCommentService,
  type ShareCommentService,
} from "@/server/share/shareCommentService";
import type { ShareCommentStore } from "@/server/share/shareCommentStore";
import {
  createShareRateLimiter,
  SHARE_COMMENT_WRITE_RATE_LIMIT,
  SHARE_OWNER_RATE_LIMIT,
  SHARE_VIEW_RATE_LIMIT,
  type ShareRateLimiter,
} from "@/server/share/shareRateLimit";
import { createShareService } from "@/server/share/shareService";
import type { ShareStore } from "@/server/share/shareStore";
import {
  createMemoryShareCommentStore,
  type MemoryShareCommentStore,
} from "@/server/share/testing/memoryShareCommentStore";
import {
  createMemoryShareStore,
  unusedClients,
} from "@/server/share/testing/memoryShareStore";
import { createTestNode } from "@/testing/createTestNode";

const SECRET = "test-token-secret";
const OWNER_ID = "sub-owner-0001";
const ALICE_ID = "sub-alice-0002";
const BOB_ID = "sub-bob-0003";
const OWNER_EMAIL = "owner@example.com";
const OWNER_SESSION: ShareSession = { userId: OWNER_ID, email: OWNER_EMAIL };
const ALICE_SESSION: ShareSession = {
  userId: ALICE_ID,
  email: "alice@example.com",
};
const BOB_SESSION: ShareSession = { userId: BOB_ID, email: "bob@example.com" };
const OWNER_COMMENTER: ShareCommenter = {
  userId: OWNER_ID,
  displayName: "所有者",
};
const ALICE: ShareCommenter = { userId: ALICE_ID, displayName: "Alice" };
const BOB: ShareCommenter = { userId: BOB_ID, displayName: "Bob" };
const STORAGE_ERROR_BODY = { ok: false, reason: "storage-error" };

function documentJson(): string {
  return serializeMapDocument(
    createMapDocument(
      [
        createTestNode({ id: 1, parentId: null, label: "根" }),
        createTestNode({ id: 2, parentId: 1, label: "子" }),
      ],
      "manual",
    ),
  );
}

type SharedFixture = {
  sharedMapId: string;
  viewToken: string;
  commentLinkId: string;
  commentToken: string;
};

type Actor = { session: ShareSession; commenter: ShareCommenter | null };

type Fixture = {
  store: ShareStore;
  commentStore: MemoryShareCommentStore;
  shareService: ReturnType<typeof createShareService>;
  mapA: SharedFixture;
  mapB: SharedFixture;
  deps(actor: Actor, overrides?: Partial<ShareApiDeps>): ShareApiDeps;
};

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
    viewToken: created.value.link.token,
    commentLinkId: comment.value.linkId,
    commentToken: comment.value.token,
  };
}

async function setup(): Promise<Fixture> {
  const store = createMemoryShareStore();
  const commentStore = createMemoryShareCommentStore();
  let shareSeq = 0;
  const shareService = createShareService({
    store,
    commentStore,
    tokenSecret: SECRET,
    publicOrigin: "http://localhost:3000",
    nowIso: () => "2026-11-26T00:00:00.000Z",
    createId: () => `share-id-${++shareSeq}`,
    // 平文トークンがレートキーなどへ漏れたら検出できる、目立つ値にする
    createToken: () => `plain-secret-token-${++shareSeq}`,
  });
  const mapA = await shareMap(shareService, "local-a");
  const mapB = await shareMap(shareService, "local-b");
  let idSeq = 0;
  let clockSeq = 0;
  const clients = unusedClients();
  return {
    store,
    commentStore,
    shareService,
    mapA,
    mapB,
    deps: (actor, overrides = {}) => ({
      getSession: async () => actor.session,
      getCommenter: async () => actor.commenter,
      d1: clients.d1,
      r2: clients.r2,
      tokenSecret: SECRET,
      publicOrigin: "http://localhost:3000",
      store,
      commentStore,
      // テストごとに新しい窓にする（プロセス共有の limiter をテスト間で使い切らない）
      ownerRateLimiter: createShareRateLimiter(SHARE_OWNER_RATE_LIMIT),
      viewRateLimiter: createShareRateLimiter(SHARE_VIEW_RATE_LIMIT),
      commentWriteRateLimiter: createShareRateLimiter(
        SHARE_COMMENT_WRITE_RATE_LIMIT,
      ),
      createId: () => `c-${++idSeq}`,
      nowIso: () =>
        `2026-11-27T00:00:${String(++clockSeq).padStart(2, "0")}.000Z`,
      ...overrides,
    }),
  };
}

const ANON: Actor = { session: null, commenter: null };
const AS_OWNER: Actor = { session: OWNER_SESSION, commenter: OWNER_COMMENTER };
const AS_ALICE: Actor = { session: ALICE_SESSION, commenter: ALICE };
const AS_BOB: Actor = { session: BOB_SESSION, commenter: BOB };

function tokenScope(token: string): ShareCommentsScope {
  return { kind: "token", token };
}

function ownerScope(f: SharedFixture): ShareCommentsScope {
  return { kind: "owner", sharedMapId: f.sharedMapId };
}

const URL_BASE = "http://localhost/api/share/comments-test";

function jsonRequest(
  method: string,
  body?: unknown,
  contentType = "application/json",
): Request {
  return new Request(URL_BASE, {
    method,
    headers: body === undefined ? undefined : { "content-type": contentType },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawRequest(
  method: string,
  body: string,
  contentType: string,
): Request {
  return new Request(URL_BASE, {
    method,
    headers: { "content-type": contentType },
    body,
  });
}

/** take の引数を記録し、deny が真のキーだけ拒否するリミッタ */
function recordingLimiter(
  deny: (key: string) => boolean = () => false,
): ShareRateLimiter & {
  keys: string[];
} {
  const keys: string[] = [];
  return {
    keys,
    take(key) {
      keys.push(key);
      return !deny(key);
    },
    size: () => 0,
  };
}

type Seeded = { threadId: string; commentId: string };

/** Alice が comment リンク経由でマップのノード 1 にスレッドを作る */
async function seedThread(
  f: Fixture,
  map: SharedFixture = f.mapA,
  options: { resolved?: boolean } = {},
): Promise<Seeded> {
  const d = f.deps(AS_ALICE);
  const scope = tokenScope(map.commentToken);
  const response = await handleCreateCommentThread(
    jsonRequest("POST", { nodeId: 1, body: "最初のコメント" }),
    scope,
    d,
  );
  expect(response.status).toBe(200);
  const json = (await response.json()) as {
    value: { id: string; comments: { id: string }[] };
  };
  const seeded = {
    threadId: json.value.id,
    commentId: json.value.comments[0].id,
  };
  if (options.resolved) {
    const resolved = await handleResolveCommentThread(
      jsonRequest("POST"),
      scope,
      seeded.threadId,
      d,
    );
    expect(resolved.status).toBe(200);
  }
  return seeded;
}

type Op = "list" | "create" | "reply" | "resolve" | "reopen" | "delete";
const OPS: readonly Op[] = [
  "list",
  "create",
  "reply",
  "resolve",
  "reopen",
  "delete",
];

function runOp(
  op: Op,
  scope: ShareCommentsScope,
  d: ShareApiDeps,
  target: Seeded,
): Promise<Response> {
  switch (op) {
    case "list":
      return handleListCommentThreads(jsonRequest("GET"), scope, d);
    case "create":
      return handleCreateCommentThread(
        jsonRequest("POST", { nodeId: 2, body: "新しいスレッド" }),
        scope,
        d,
      );
    case "reply":
      return handleReplyCommentThread(
        jsonRequest("POST", { body: "返信" }),
        scope,
        target.threadId,
        d,
      );
    case "resolve":
      return handleResolveCommentThread(
        jsonRequest("POST"),
        scope,
        target.threadId,
        d,
      );
    case "reopen":
      return handleReopenCommentThread(
        jsonRequest("POST"),
        scope,
        target.threadId,
        d,
      );
    case "delete":
      return handleDeleteComment(
        jsonRequest("DELETE"),
        scope,
        target.commentId,
        d,
      );
  }
}

type Expected = Record<Op, number>;
const ALL_200: Expected = {
  list: 200,
  create: 200,
  reply: 200,
  resolve: 200,
  reopen: 200,
  delete: 200,
};
const ALL_404: Expected = {
  list: 404,
  create: 404,
  reply: 404,
  resolve: 404,
  reopen: 404,
  delete: 404,
};
const ALL_401: Expected = {
  list: 401,
  create: 401,
  reply: 401,
  resolve: 401,
  reopen: 401,
  delete: 401,
};

type MatrixRow = {
  name: string;
  actor: Actor;
  scope: (f: Fixture) => ShareCommentsScope | Promise<ShareCommentsScope>;
  expected: Expected;
};

const MATRIX: readonly MatrixRow[] = [
  // トークン経路
  {
    name: "トークン経路: 所有者（comment リンク）",
    actor: AS_OWNER,
    scope: (f) => tokenScope(f.mapA.commentToken),
    expected: ALL_200,
  },
  {
    name: "トークン経路: comment＋ログイン（作成者・投稿者本人）",
    actor: AS_ALICE,
    scope: (f) => tokenScope(f.mapA.commentToken),
    expected: ALL_200,
  },
  {
    name: "トークン経路: comment＋ログイン（他人のスレッド・コメント）",
    actor: AS_BOB,
    scope: (f) => tokenScope(f.mapA.commentToken),
    expected: {
      list: 200,
      create: 200,
      reply: 200,
      resolve: 404,
      reopen: 404,
      delete: 404,
    },
  },
  {
    name: "トークン経路: comment・未ログイン",
    actor: ANON,
    scope: (f) => tokenScope(f.mapA.commentToken),
    expected: {
      list: 200,
      create: 401,
      reply: 401,
      resolve: 401,
      reopen: 401,
      delete: 401,
    },
  },
  {
    name: "トークン経路: view リンク（所有者がログイン中）",
    actor: AS_OWNER,
    scope: (f) => tokenScope(f.mapA.viewToken),
    expected: ALL_404,
  },
  {
    name: "トークン経路: view リンク（未ログイン）",
    actor: ANON,
    scope: (f) => tokenScope(f.mapA.viewToken),
    expected: ALL_404,
  },
  {
    name: "トークン経路: 失効した comment リンク",
    actor: AS_ALICE,
    scope: async (f) => {
      const revoked = await f.shareService.revokeLink(
        OWNER_SESSION,
        f.mapA.commentLinkId,
      );
      expect(revoked.ok).toBe(true);
      return tokenScope(f.mapA.commentToken);
    },
    expected: ALL_404,
  },
  {
    name: "トークン経路: 不明なトークン",
    actor: AS_ALICE,
    scope: () => tokenScope("unknown-token"),
    expected: ALL_404,
  },
  // 所有者経路
  {
    name: "所有者経路: 所有者",
    actor: AS_OWNER,
    scope: (f) => ownerScope(f.mapA),
    expected: ALL_200,
  },
  {
    name: "所有者経路: 未ログイン",
    actor: ANON,
    scope: (f) => ownerScope(f.mapA),
    expected: ALL_401,
  },
  {
    name: "所有者経路: 他人のマップ",
    actor: AS_BOB,
    scope: (f) => ownerScope(f.mapA),
    expected: ALL_404,
  },
  {
    name: "所有者経路: セッションはあるが投稿者が取れない",
    actor: { session: OWNER_SESSION, commenter: null },
    scope: (f) => ownerScope(f.mapA),
    expected: ALL_401,
  },
  {
    name: "所有者経路: 存在しない sharedMapId",
    actor: AS_OWNER,
    scope: () => ({ kind: "owner", sharedMapId: "missing-map" }),
    expected: ALL_404,
  },
];

describe("コメント API: 設計 §6.2 の権限表", () => {
  for (const row of MATRIX) {
    for (const op of OPS) {
      it(`${row.name} × ${op} → ${row.expected[op]}`, async () => {
        const f = await setup();
        const seeded = await seedThread(f, f.mapA, {
          resolved: op === "reopen",
        });
        const scope = await row.scope(f);
        const response = await runOp(op, scope, f.deps(row.actor), seeded);
        expect(response.status).toBe(row.expected[op]);
        const json = (await response.json()) as {
          ok: boolean;
          reason?: string;
        };
        expect(json.ok).toBe(row.expected[op] === 200);
        if (row.expected[op] === 404) expect(json.reason).toBe("not-found");
        if (row.expected[op] === 401)
          expect(json.reason).toBe("unauthenticated");
      });
    }
  }

  it("comment・未ログインの一覧は viewer.signedIn=false・canPost=false で返る", async () => {
    const f = await setup();
    await seedThread(f);
    const response = await handleListCommentThreads(
      jsonRequest("GET"),
      tokenScope(f.mapA.commentToken),
      f.deps(ANON),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      value: { threads: unknown[]; viewer: unknown };
    };
    expect(json.value.viewer).toEqual({
      signedIn: false,
      canPost: false,
      isOwner: false,
    });
    expect(json.value.threads).toHaveLength(1);
  });
});

describe("コメント API: 判定順", () => {
  it("view リンク＋未ログインの書込みは 404 で、書込み枠を消費しない", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const writeLimiter = recordingLimiter();
    const d = f.deps(ANON, { commentWriteRateLimiter: writeLimiter });
    for (const op of OPS.filter((o) => o !== "list")) {
      const response = await runOp(op, tokenScope(f.mapA.viewToken), d, seeded);
      expect(response.status).toBe(404);
    }
    expect(writeLimiter.keys).toEqual([]);
  });

  it("comment・未ログインの書込みは 401 で、書込み枠を消費しない", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const writeLimiter = recordingLimiter();
    const d = f.deps(ANON, { commentWriteRateLimiter: writeLimiter });
    for (const op of OPS.filter((o) => o !== "list")) {
      const response = await runOp(
        op,
        tokenScope(f.mapA.commentToken),
        d,
        seeded,
      );
      expect(response.status).toBe(401);
    }
    expect(writeLimiter.keys).toEqual([]);
  });

  it("書込みの枠はユーザー → IP の順で取る（一覧では取らない）", async () => {
    const f = await setup();
    const writeLimiter = recordingLimiter();
    const d = f.deps(AS_ALICE, { commentWriteRateLimiter: writeLimiter });
    await handleListCommentThreads(
      jsonRequest("GET"),
      tokenScope(f.mapA.commentToken),
      d,
    );
    expect(writeLimiter.keys).toEqual([]);
    const request = new Request(URL_BASE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
      },
      body: JSON.stringify({ nodeId: 1, body: "x" }),
    });
    const response = await handleCreateCommentThread(
      request,
      tokenScope(f.mapA.commentToken),
      d,
    );
    expect(response.status).toBe(200);
    expect(writeLimiter.keys).toEqual([
      `comment-write:user:${ALICE_ID}`,
      "comment-write:ip:203.0.113.7",
    ]);
  });

  it("書込み枠の超過は本文が壊れていても 429（ユーザーキー・IP キーそれぞれ）", async () => {
    for (const prefix of ["comment-write:user:", "comment-write:ip:"]) {
      const f = await setup();
      const d = f.deps(AS_ALICE, {
        commentWriteRateLimiter: recordingLimiter((key) =>
          key.startsWith(prefix),
        ),
      });
      const response = await handleCreateCommentThread(
        rawRequest("POST", "{{not json", "text/plain"),
        tokenScope(f.mapA.commentToken),
        d,
      );
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({
        ok: false,
        reason: "rate-limited",
      });
    }
  });

  it("書込みで access.actor が null なら書込み枠を消費せず 401（fail-closed）", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const map = await f.store.getMap(f.mapA.sharedMapId);
    if (!map) throw new Error("map missing");
    const real = createShareCommentService({
      store: f.store,
      commentStore: f.commentStore,
      tokenSecret: SECRET,
      getSession: async () => OWNER_SESSION,
      getCommenter: async () => OWNER_COMMENTER,
    });
    // resolveAccess が契約に反して actor: null の成功を返す場合を作る
    const broken: ShareCommentService = {
      ...real,
      resolveAccess: async () => ({
        ok: true,
        value: { map, actor: null, isOwner: false, via: "token" },
      }),
    };
    const writeLimiter = recordingLimiter();
    const d = f.deps(AS_ALICE, {
      commentService: broken,
      commentWriteRateLimiter: writeLimiter,
    });
    for (const op of OPS.filter((o) => o !== "list")) {
      const response = await runOp(
        op,
        tokenScope(f.mapA.commentToken),
        d,
        seeded,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        reason: "unauthenticated",
      });
    }
    expect(writeLimiter.keys).toEqual([]);
  });

  it("所有者経路の書込みも書込み枠を取り、超過は 429", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const d = f.deps(AS_OWNER, {
      commentWriteRateLimiter: recordingLimiter(() => true),
    });
    for (const op of OPS.filter((o) => o !== "list")) {
      const response = await runOp(op, ownerScope(f.mapA), d, seeded);
      expect(response.status).toBe(429);
    }
    const list = await runOp("list", ownerScope(f.mapA), d, seeded);
    expect(list.status).toBe(200);
  });
});

describe("コメント API: 経路のレート制限", () => {
  it("トークン経路は view リミッタの IP キー超過で 429", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const d = f.deps(AS_ALICE, {
      viewRateLimiter: recordingLimiter((key) => key.startsWith("view:ip:")),
    });
    for (const op of OPS) {
      const response = await runOp(
        op,
        tokenScope(f.mapA.commentToken),
        d,
        seeded,
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });

  it("トークン経路は view リミッタのトークンキー超過で 429", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const d = f.deps(AS_ALICE, {
      viewRateLimiter: recordingLimiter(
        (key) => key.startsWith("view:") && !key.startsWith("view:ip:"),
      ),
    });
    for (const op of OPS) {
      const response = await runOp(
        op,
        tokenScope(f.mapA.commentToken),
        d,
        seeded,
      );
      expect(response.status).toBe(429);
    }
  });

  it("トークン経路は view:ip → view:<tokenHash> の順で取り、空トークンは view:empty", async () => {
    const f = await setup();
    const limiter = recordingLimiter();
    const d = f.deps(ANON, { viewRateLimiter: limiter });
    const response = await handleListCommentThreads(
      jsonRequest("GET"),
      tokenScope(""),
      d,
    );
    expect(response.status).toBe(404);
    expect(limiter.keys).toEqual(["view:ip:unknown", "view:empty"]);
  });

  it("所有者経路は owner リミッタの超過で 429（キーは owner:<userId>）", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const limiter = recordingLimiter(() => true);
    const d = f.deps(AS_OWNER, { ownerRateLimiter: limiter });
    for (const op of OPS) {
      const response = await runOp(op, ownerScope(f.mapA), d, seeded);
      expect(response.status).toBe(429);
    }
    expect(new Set(limiter.keys)).toEqual(new Set([`owner:${OWNER_ID}`]));
  });

  it("所有者経路の未ログインは owner:anonymous の枠を取る", async () => {
    const f = await setup();
    const limiter = recordingLimiter();
    const d = f.deps(ANON, { ownerRateLimiter: limiter });
    const response = await handleListCommentThreads(
      jsonRequest("GET"),
      ownerScope(f.mapA),
      d,
    );
    expect(response.status).toBe(401);
    expect(limiter.keys).toEqual(["owner:anonymous"]);
  });
});

describe("コメント API: 本文の検証", () => {
  async function createWith(request: Request): Promise<Response> {
    const f = await setup();
    return handleCreateCommentThread(
      request,
      tokenScope(f.mapA.commentToken),
      f.deps(AS_ALICE),
    );
  }

  it("16 KiB を超える本文は 413", async () => {
    const response = await createWith(
      jsonRequest("POST", {
        nodeId: 1,
        body: "a".repeat(SHARE_COMMENT_MAX_BODY_BYTES + 1),
      }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, reason: "too-large" });
  });

  it("JSON でない本文は 400", async () => {
    const response = await createWith(
      rawRequest("POST", "{{not json", "application/json"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "invalid-request",
    });
  });

  it("オブジェクトでない JSON は 400", async () => {
    for (const body of ["[]", "null", '"text"', "1"]) {
      const response = await createWith(
        rawRequest("POST", body, "application/json"),
      );
      expect(response.status).toBe(400);
    }
  });

  it.each(["authorName", "displayName", "author", "createdByUserId"])(
    "作成に %s キーが混ざると 400",
    async (key) => {
      const response = await createWith(
        jsonRequest("POST", { nodeId: 1, body: "x", [key]: "なりすまし" }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        reason: "invalid-request",
      });
    },
  );

  it.each<[string, unknown]>([
    ["文字列の数字", "1"],
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
    ["安全な整数を超える値", Number.MAX_SAFE_INTEGER + 1],
    ["null", null],
  ])("nodeId が %s なら 400", async (_label, nodeId) => {
    const response = await createWith(
      jsonRequest("POST", { nodeId, body: "x" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "invalid-request",
    });
  });

  it("nodeId や body が欠けていたら 400", async () => {
    expect((await createWith(jsonRequest("POST", { body: "x" }))).status).toBe(
      400,
    );
    expect((await createWith(jsonRequest("POST", { nodeId: 1 }))).status).toBe(
      400,
    );
    expect(
      (await createWith(jsonRequest("POST", { nodeId: 1, body: 5 }))).status,
    ).toBe(400);
  });

  it("作成の Content-Type が text/plain なら 400", async () => {
    const response = await createWith(
      jsonRequest("POST", { nodeId: 1, body: "x" }, "text/plain"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "invalid-request",
    });
  });

  it("Content-Type の大文字小文字と ; 以降は無視する", async () => {
    const response = await createWith(
      jsonRequest(
        "POST",
        { nodeId: 1, body: "x" },
        " Application/JSON ; charset=utf-8",
      ),
    );
    expect(response.status).toBe(200);
  });

  it("返信: 表示名キー・text/plain・body の型違いは 400", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const scope = tokenScope(f.mapA.commentToken);
    const d = f.deps(AS_ALICE);
    const cases = [
      jsonRequest("POST", { body: "x", displayName: "偽名" }),
      jsonRequest("POST", { body: "x", nodeId: 1 }),
      jsonRequest("POST", { body: "x" }, "text/plain"),
      jsonRequest("POST", { body: 1 }),
      jsonRequest("POST", {}),
    ];
    for (const request of cases) {
      const response = await handleReplyCommentThread(
        request,
        scope,
        seeded.threadId,
        d,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        reason: "invalid-request",
      });
    }
  });

  it("resolve / reopen / DELETE は text/plain の壊れた本文付きでも成功する", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const scope = tokenScope(f.mapA.commentToken);
    const d = f.deps(AS_ALICE);
    const broken = () => rawRequest("POST", "{{broken", "text/plain");
    expect(
      (await handleResolveCommentThread(broken(), scope, seeded.threadId, d))
        .status,
    ).toBe(200);
    expect(
      (await handleReopenCommentThread(broken(), scope, seeded.threadId, d))
        .status,
    ).toBe(200);
    const del = await handleDeleteComment(
      rawRequest("DELETE", "{{broken", "text/plain"),
      scope,
      seeded.commentId,
      d,
    );
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({
      ok: true,
      value: { commentId: seeded.commentId, threadDeleted: true },
    });
  });
});

describe("コメント API: reason → HTTP", () => {
  it("invalid-comment は 400", async () => {
    const f = await setup();
    const response = await handleCreateCommentThread(
      jsonRequest("POST", { nodeId: 1, body: "   " }),
      tokenScope(f.mapA.commentToken),
      f.deps(AS_ALICE),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "invalid-comment",
    });
  });

  it("invalid-node は 400", async () => {
    const f = await setup();
    const response = await handleCreateCommentThread(
      jsonRequest("POST", { nodeId: 999, body: "x" }),
      tokenScope(f.mapA.commentToken),
      f.deps(AS_ALICE),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "invalid-node",
    });
  });

  it("thread-resolved は 409", async () => {
    const f = await setup();
    const seeded = await seedThread(f, f.mapA, { resolved: true });
    const response = await handleReplyCommentThread(
      jsonRequest("POST", { body: "返信" }),
      tokenScope(f.mapA.commentToken),
      seeded.threadId,
      f.deps(AS_BOB),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "thread-resolved",
    });
  });

  it("comment-limit は 409", async () => {
    const f = await setup();
    for (let i = 0; i < SHARE_COMMENT_MAX_THREADS_PER_MAP; i += 1) {
      f.commentStore.threads.push({
        id: `filler-${i}`,
        sharedMapId: f.mapA.sharedMapId,
        nodeId: 1,
        nodeLabelSnapshot: "根",
        status: "open",
        createdByUserId: ALICE_ID,
        createdAt: "2026-11-26T00:00:00.000Z",
        updatedAt: "2026-11-26T00:00:00.000Z",
        resolvedByUserId: null,
        resolvedByName: null,
        resolvedAt: null,
      });
    }
    const response = await handleCreateCommentThread(
      jsonRequest("POST", { nodeId: 1, body: "x" }),
      tokenScope(f.mapA.commentToken),
      f.deps(AS_ALICE),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "comment-limit",
    });
  });
});

describe("コメント API: 応答ヘッダーと秘匿", () => {
  it("トークン経路は成否とも Cache-Control: private, no-store と Referrer-Policy: no-referrer", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    for (const token of [f.mapA.commentToken, f.mapA.viewToken]) {
      for (const op of OPS) {
        const response = await runOp(
          op,
          tokenScope(token),
          f.deps(AS_ALICE),
          seeded,
        );
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      }
    }
  });

  it("所有者経路は成否とも Cache-Control: private, no-store", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    for (const actor of [AS_OWNER, ANON]) {
      for (const op of OPS) {
        const response = await runOp(
          op,
          ownerScope(f.mapA),
          f.deps(actor),
          seeded,
        );
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      }
    }
  });

  it("応答本文に投稿者の userId とメールが含まれない", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const bodies: string[] = [];
    for (const [scope, actor] of [
      [ownerScope(f.mapA), AS_OWNER],
      [tokenScope(f.mapA.commentToken), AS_BOB],
    ] as const) {
      for (const op of ["list", "create", "reply"] as const) {
        bodies.push(
          await (await runOp(op, scope, f.deps(actor), seeded)).text(),
        );
      }
    }
    bodies.push(
      await (
        await runOp("resolve", ownerScope(f.mapA), f.deps(AS_OWNER), seeded)
      ).text(),
    );
    for (const text of bodies) {
      for (const secret of [
        OWNER_ID,
        ALICE_ID,
        BOB_ID,
        OWNER_EMAIL,
        "alice@example.com",
        "bob@example.com",
      ]) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it("レートキーに平文トークンを載せない（L-017 / L-029）", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const viewLimiter = recordingLimiter();
    const writeLimiter = recordingLimiter();
    const d = f.deps(AS_ALICE, {
      viewRateLimiter: viewLimiter,
      commentWriteRateLimiter: writeLimiter,
    });
    for (const op of OPS) {
      await runOp(op, tokenScope(f.mapA.commentToken), d, seeded);
    }
    expect(viewLimiter.keys.length).toBeGreaterThan(0);
    expect(writeLimiter.keys.length).toBeGreaterThan(0);
    for (const key of [...viewLimiter.keys, ...writeLimiter.keys]) {
      expect(key).not.toContain(f.mapA.commentToken);
      expect(key).not.toContain("plain-secret-token");
    }
  });

  it("ストアの例外の生メッセージを応答に出さない", async () => {
    const f = await setup();
    const seeded = await seedThread(f);
    const leaky = new Error(
      "SQLITE_ERROR: secret-detail token=plain-secret-token-x",
    );
    const throwing: ShareCommentStore = {
      ...f.commentStore,
      listThreadsByMap: async () => {
        throw leaky;
      },
      insertThreadWithinLimits: async () => {
        throw leaky;
      },
      insertCommentWithinLimits: async () => {
        throw leaky;
      },
      getThread: async () => {
        throw leaky;
      },
      getComment: async () => {
        throw leaky;
      },
    };
    const d = f.deps(AS_ALICE, { commentStore: throwing });
    for (const op of OPS) {
      const response = await runOp(
        op,
        tokenScope(f.mapA.commentToken),
        d,
        seeded,
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual(STORAGE_ERROR_BODY);
    }
  });
});

describe("コメント API: 経路パラメータと別マップ", () => {
  it("threadId / commentId が空文字なら not-found", async () => {
    const f = await setup();
    await seedThread(f);
    for (const scope of [ownerScope(f.mapA), tokenScope(f.mapA.commentToken)]) {
      const d = f.deps(AS_OWNER);
      const responses = [
        await handleReplyCommentThread(
          jsonRequest("POST", { body: "x" }),
          scope,
          "",
          d,
        ),
        await handleResolveCommentThread(jsonRequest("POST"), scope, "", d),
        await handleReopenCommentThread(jsonRequest("POST"), scope, "", d),
        await handleDeleteComment(jsonRequest("DELETE"), scope, "", d),
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          ok: false,
          reason: "not-found",
        });
      }
    }
  });

  it("マップ B のスレッド・コメントをマップ A の URL で操作すると 404 で、B の行は変わらない", async () => {
    const f = await setup();
    const seededB = await seedThread(f, f.mapB);
    const before = JSON.stringify({
      threads: f.commentStore.threads,
      comments: f.commentStore.comments,
    });
    for (const scope of [ownerScope(f.mapA), tokenScope(f.mapA.commentToken)]) {
      for (const op of ["reply", "resolve", "reopen", "delete"] as const) {
        const response = await runOp(op, scope, f.deps(AS_OWNER), seededB);
        expect(response.status).toBe(404);
      }
    }
    expect(
      JSON.stringify({
        threads: f.commentStore.threads,
        comments: f.commentStore.comments,
      }),
    ).toBe(before);
  });
});
