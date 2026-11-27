/** @jest-environment node */

import { createHash } from "node:crypto";
import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { ShareSession } from "@/domain/share/shareSession";
import { tokenHash } from "@/domain/share/tokenHash";
import {
  handleCollabEvacuate,
  handleCollabJoin,
  handleCreateCollabSession,
  handleEndCollabSession,
  handleGetCollabSession,
  handleLeaveCollabSession,
  handleReissueCollabTicket,
  type CollabApiDeps,
} from "@/server/collab/handleCollabApi";
import {
  COLLAB_RATE_LIMIT,
  createCollabRateLimiter,
  processCollabRateLimiter,
} from "@/server/collab/collabRateLimit";
import { COLLAB_PRIVATE_NO_STORE } from "@/server/collab/collabResponses";
import type { CollabRoomClient } from "@/server/collab/collabRoomClient";
import {
  COLLAB_TICKET_TTL_SECONDS,
  verifyCollabTicket,
} from "@/server/collab/collabTicket";
import { createMemoryCollabStore } from "@/server/collab/testing/memoryCollabStore";
import {
  createMemoryShareStore,
  unusedClients,
} from "@/server/share/testing/memoryShareStore";
import type { ShareStore } from "@/server/share/shareStore";
import { createTestNode } from "@/testing/createTestNode";
import * as Y from "yjs";

const OWNER: ShareSession = { userId: "user-1", email: "a@example.com" , displayName: null };
const EDITOR: ShareSession = { userId: "user-2", email: "b@example.com" , displayName: null };
const OTHER: ShareSession = { userId: "user-3", email: "c@example.com" , displayName: null };
const TOKEN_SECRET = "test-token-secret";
const TICKET_SECRET = "test-ticket-secret";
const WS_ORIGIN = "wss://collab.example.test";

function validDocumentJson(): string {
  return serializeMapDocument(
    createMapDocument(
      [
        createTestNode({
          id: 1,
          parentId: null,
          x: 0,
          y: 0,
          width: 160,
          height: 64,
          label: "根",
          importance: "high",
        }),
      ],
      "manual",
    ),
  );
}

function createMemoryRoom(options?: {
  seedFail?: boolean;
  exportFail?: boolean;
  exportEmpty?: boolean;
  destroyFail?: boolean;
  connectionCount?: number;
}): CollabRoomClient & {
  seeded: Map<string, Uint8Array>;
  destroyed: Set<string>;
  setConnectionCount(n: number): void;
  setConnectionCountFail(fail: boolean): void;
  setDestroyFail(fail: boolean): void;
} {
  const seeded = new Map<string, Uint8Array>();
  const destroyed = new Set<string>();
  let connectionCount = options?.connectionCount ?? 0;
  let connectionCountFail = false;
  let destroyFail = options?.destroyFail ?? false;
  return {
    seeded,
    destroyed,
    setConnectionCount(n) {
      connectionCount = n;
    },
    setConnectionCountFail(fail) {
      connectionCountFail = fail;
    },
    setDestroyFail(fail) {
      destroyFail = fail;
    },
    async seed(sessionId, update) {
      if (options?.seedFail) return { ok: false, reason: "seed-failed" };
      seeded.set(sessionId, update);
      destroyed.delete(sessionId);
      return { ok: true };
    },
    async exportYjsUpdate(sessionId) {
      if (destroyed.has(sessionId)) {
        return { ok: false, reason: "export-failed" };
      }
      if (options?.exportFail) return { ok: false, reason: "export-failed" };
      if (options?.exportEmpty) return { ok: false, reason: "export-empty" };
      const update = seeded.get(sessionId);
      if (!update || update.byteLength === 0) {
        return { ok: false, reason: "export-empty" };
      }
      return { ok: true, value: update };
    },
    async getConnectionCount() {
      if (connectionCountFail) {
        return { ok: false, reason: "connection-count-failed" };
      }
      return { ok: true, value: connectionCount };
    },
    async destroy(sessionId) {
      if (destroyFail) {
        return { ok: false, reason: "destroy-failed" };
      }
      destroyed.add(sessionId);
      return { ok: true };
    },
  };
}

async function seedShareWithEditLink(
  shareStore: ShareStore,
  opts: { token: string; permission?: string; revoked?: boolean } = {
    token: "edit-token-1",
  },
): Promise<{ sharedMapId: string }> {
  const now = "2026-11-27T00:00:00.000Z";
  const sharedMapId = "map-1";
  await shareStore.insertMap({
    id: sharedMapId,
    ownerUserId: OWNER!.userId,
    localMapId: "local-1",
    title: "地図",
    currentRevisionId: "rev-1",
    createdAt: now,
    updatedAt: now,
  });
  await shareStore.insertRevision({
    id: "rev-1",
    sharedMapId,
    r2Key: "shares/map-1/rev-1.json",
    byteSize: 2,
    contentSha256: createHash("sha256").update("{}").digest("hex"),
    publishedAt: now,
  });
  await shareStore.putDocument("shares/map-1/rev-1.json", new TextEncoder().encode("{}"));
  await shareStore.insertLink({
    id: "link-1",
    sharedMapId,
    tokenHash: tokenHash(opts.token, TOKEN_SECRET),
    permission: opts.permission ?? "edit",
    createdAt: now,
    revokedAt: opts.revoked ? now : null,
    expiresAt: null,
  });
  return { sharedMapId };
}

function deps(
  overrides: Partial<CollabApiDeps> & {
    session?: ShareSession;
    room?: ReturnType<typeof createMemoryRoom>;
    shareStore?: ShareStore;
  } = {},
): CollabApiDeps {
  const clients = unusedClients();
  const { session = OWNER, room = createMemoryRoom(), shareStore, ...rest } = overrides;
  return {
    getSession: async () => session,
    d1: clients.d1,
    r2: clients.r2,
    tokenSecret: TOKEN_SECRET,
    ticketSecret: TICKET_SECRET,
    wsOrigin: WS_ORIGIN,
    shareStore: shareStore ?? createMemoryShareStore(),
    store: createMemoryCollabStore(),
    room,
    rateLimiter: createCollabRateLimiter(COLLAB_RATE_LIMIT),
    createId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
    nowIso: () => "2026-11-27T12:00:00.000Z",
    nowMs: () => Date.parse("2026-11-27T12:00:00.000Z"),
    ...rest,
  };
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Collab API 契約", () => {
  it("未ログインの sessions / join / end / ticket は 401 で no-store", async () => {
    const d = deps({ session: null });
    const create = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(create.status).toBe(401);
    expect(create.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);
    expect(await create.json()).toEqual({ ok: false, reason: "unauthenticated" });

    const join = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      d,
    );
    expect(join.status).toBe(401);
    expect(join.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);

    const end = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/x/end", "POST"),
      "x",
      d,
    );
    expect(end.status).toBe(401);
    expect(end.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);

    const ticket = await handleReissueCollabTicket(
      jsonRequest("http://localhost/api/collab/sessions/x/ticket", "POST"),
      "x",
      d,
    );
    expect(ticket.status).toBe(401);
    expect(ticket.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);
  });

  it("view / comment トークンの join は 404（存在を漏らさない）", async () => {
    const viewStore = createMemoryShareStore();
    await seedShareWithEditLink(viewStore, { token: "view-tok", permission: "view" });
    const viewJoin = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "view-tok" }),
      deps({ shareStore: viewStore, session: EDITOR }),
    );
    expect(viewJoin.status).toBe(404);
    expect(await viewJoin.json()).toEqual({ ok: false, reason: "not-found" });

    const commentStore = createMemoryShareStore();
    await seedShareWithEditLink(commentStore, {
      token: "comment-tok",
      permission: "comment",
    });
    const commentJoin = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "comment-tok" }),
      deps({ shareStore: commentStore, session: EDITOR }),
    );
    expect(commentJoin.status).toBe(404);
    expect(await commentJoin.json()).toEqual({ ok: false, reason: "not-found" });
  });

  it("失効・不明トークンの join は 404", async () => {
    const shareStore = createMemoryShareStore();
    await seedShareWithEditLink(shareStore, { token: "revoked-tok", revoked: true });
    const d = deps({ shareStore, session: EDITOR });

    const revoked = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "revoked-tok" }),
      d,
    );
    expect(revoked.status).toBe(404);
    expect(await revoked.json()).toEqual({ ok: false, reason: "not-found" });

    const unknown = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "unknown-tok" }),
      d,
    );
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ ok: false, reason: "not-found" });
  });

  it("所有者の開始と edit+ログインの join が ticket / wsUrl を返す", async () => {
    const shareStore = createMemoryShareStore();
    const { sharedMapId } = await seedShareWithEditLink(shareStore);
    const room = createMemoryRoom();
    const store = createMemoryCollabStore();
    const ownerDeps = deps({ shareStore, store, room, session: OWNER });

    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        sharedMapId,
        documentJson: validDocumentJson(),
      }),
      ownerDeps,
    );
    expect(created.status).toBe(200);
    expect(created.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);
    const createdBody = await created.json();
    expect(createdBody.ok).toBe(true);
    expect(createdBody.value.sessionId).toBe("id-1");
    expect(typeof createdBody.value.ticket).toBe("string");
    expect(createdBody.value.ticket.length).toBeGreaterThan(10);
    expect(createdBody.value.wsUrl).toBe(`${WS_ORIGIN}/collab/id-1`);
    expect(room.seeded.has("id-1")).toBe(true);

    const session = await store.getSession("id-1");
    expect(session?.status).toBe("active");

    const editorDeps = deps({ shareStore, store, room, session: EDITOR });
    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      editorDeps,
    );
    expect(joined.status).toBe(200);
    expect(joined.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);
    const joinedBody = await joined.json();
    expect(joinedBody.ok).toBe(true);
    expect(joinedBody.value.sessionId).toBe("id-1");
    expect(joinedBody.value.wsUrl).toBe(`${WS_ORIGIN}/collab/id-1`);
    expect(typeof joinedBody.value.ticket).toBe("string");
  });

  it("edit だが active session が無い join は 404 no-active-session", async () => {
    const shareStore = createMemoryShareStore();
    await seedShareWithEditLink(shareStore);
    const d = deps({ shareStore, session: EDITOR });
    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      d,
    );
    expect(joined.status).toBe(404);
    expect(await joined.json()).toEqual({ ok: false, reason: "no-active-session" });
  });

  it("同時接続上限超過の join は 429", async () => {
    const shareStore = createMemoryShareStore();
    const { sharedMapId } = await seedShareWithEditLink(shareStore);
    const room = createMemoryRoom({ connectionCount: 8 });
    const store = createMemoryCollabStore();
    const ownerDeps = deps({ shareStore, store, room, session: OWNER });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        sharedMapId,
        documentJson: validDocumentJson(),
      }),
      ownerDeps,
    );
    expect(created.status).toBe(200);

    const editorDeps = deps({ shareStore, store, room, session: EDITOR });
    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      editorDeps,
    );
    expect(joined.status).toBe(429);
    expect(await joined.json()).toEqual({ ok: false, reason: "connection-limit" });
  });

  it("成功・404 とも Cache-Control: private, no-store", async () => {
    const shareStore = createMemoryShareStore();
    await seedShareWithEditLink(shareStore);
    const d = deps({ shareStore, session: EDITOR });
    const missing = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      d,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);

    const getMissing = await handleGetCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/nope", "GET"),
      "nope",
      d,
    );
    expect(getMissing.status).toBe(404);
    expect(getMissing.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);
  });

  it("seed 失敗で session は active にならない（failed）", async () => {
    const room = createMemoryRoom({ seedFail: true });
    const store = createMemoryCollabStore();
    const d = deps({ store, room });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(created.status).toBe(502);
    expect(await created.json()).toEqual({ ok: false, reason: "seed-failed" });
    const session = await store.getSession("id-1");
    expect(session).not.toBeNull();
    expect(session?.status).toBe("failed");
    expect(session?.status).not.toBe("active");
  });

  it("end の export 失敗では session は active のまま", async () => {
    const room = createMemoryRoom({ exportFail: true });
    const store = createMemoryCollabStore();
    const d = deps({ store, room });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(created.status).toBe(200);
    const end = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(end.status).toBe(502);
    expect(await end.json()).toEqual({ ok: false, reason: "export-failed" });
    expect((await store.getSession("id-1"))?.status).toBe("active");
  });

  it("空 export では session を ended にせず失敗する", async () => {
    const room = createMemoryRoom({ exportEmpty: true });
    const store = createMemoryCollabStore();
    const d = deps({ store, room });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(created.status).toBe(200);
    const end = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(end.status).toBe(502);
    expect(await end.json()).toEqual({ ok: false, reason: "export-empty" });
    expect((await store.getSession("id-1"))?.status).toBe("active");
  });

  it("decode の invalid-document を export-empty に潰さない", async () => {
    const room = createMemoryRoom();
    const store = createMemoryCollabStore();
    const d = deps({ store, room });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(created.status).toBe(200);

    // 空 Y.Map は encode に載らないため、ノードを1件入れて version だけ壊す
    const bad = new Y.Doc();
    const nodes = bad.getMap("nodes");
    const yNode = new Y.Map();
    yNode.set("id", 1);
    yNode.set("parentId", null);
    yNode.set("x", 0);
    yNode.set("y", 0);
    yNode.set("width", 160);
    yNode.set("height", 64);
    yNode.set("label", "根");
    yNode.set("importance", "high");
    nodes.set("1", yNode);
    const meta = bad.getMap("meta");
    meta.set("version", 2);
    meta.set("layoutMode", "manual");
    meta.set("nextId", 2);
    room.seeded.set("id-1", Y.encodeStateAsUpdate(bad));

    const end = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(end.status).toBe(400);
    expect(await end.json()).toEqual({ ok: false, reason: "invalid-document" });
    expect((await store.getSession("id-1"))?.status).toBe("active");
  });

  it("creating 中の二重 start は already-exists", async () => {
    const store = createMemoryCollabStore();
    await store.insertSession({
      id: "pending-1",
      ownerUserId: OWNER!.userId,
      localMapId: "local-1",
      sharedMapId: null,
      status: "creating",
      artifactR2Key: null,
      createdAt: "2026-11-27T11:00:00.000Z",
      endedAt: null,
    });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      deps({ store }),
    );
    expect(created.status).toBe(409);
    expect(await created.json()).toEqual({ ok: false, reason: "already-exists" });
  });

  it("seedFromArtifact 成功で ticket を返し、空 artifact は拒否する", async () => {
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    const d = deps({ store, room });

    const first = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(first.status).toBe(200);
    const ended = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(ended.status).toBe(200);

    const fromArtifact = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        seedFromArtifact: true,
      }),
      deps({
        store,
        room: createMemoryRoom(),
        createId: (() => {
          let n = 1;
          return () => `id-${++n}`;
        })(),
      }),
    );
    expect(fromArtifact.status).toBe(200);
    const body = await fromArtifact.json();
    expect(body.ok).toBe(true);
    expect(body.value.sessionId).toBe("id-2");
    expect(typeof body.value.ticket).toBe("string");

    // 空 artifact は上書きせず拒否
    const emptyStore = createMemoryCollabStore();
    await emptyStore.insertSession({
      id: "old-ended",
      ownerUserId: OWNER!.userId,
      localMapId: "local-empty",
      sharedMapId: null,
      status: "ended",
      artifactR2Key: "collab/old-ended/artifact.ydoc",
      createdAt: "2026-11-27T10:00:00.000Z",
      endedAt: "2026-11-27T11:00:00.000Z",
    });
    await emptyStore.putArtifact(
      "collab/old-ended/artifact.ydoc",
      new Uint8Array(0),
    );
    const emptyReject = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-empty",
        seedFromArtifact: true,
      }),
      deps({ store: emptyStore }),
    );
    expect(emptyReject.status).toBe(502);
    expect(await emptyReject.json()).toEqual({ ok: false, reason: "export-empty" });
    expect(await emptyStore.findOpenByOwnerAndLocalMapId(OWNER!.userId, "local-empty")).toBeNull();
  });

  it("レート制限は注入シングルトンでリクエスト跨ぎに効く", async () => {
    const rateLimiter = createCollabRateLimiter({ limit: 1, windowMs: 60_000 });
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    const firstDeps = deps({ store, room, rateLimiter });
    const secondDeps = deps({ store, room, rateLimiter });

    const first = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      firstDeps,
    );
    expect(first.status).toBe(200);

    const second = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-2",
        documentJson: validDocumentJson(),
      }),
      secondDeps,
    );
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ ok: false, reason: "rate-limited" });

    // プロセス共有シングルトンが export されていること（毎回 new しない正本）
    expect(processCollabRateLimiter).toBeDefined();
    expect(typeof processCollabRateLimiter.take).toBe("function");
  });

  it("wsUrl origin は env 正本で、x-forwarded-host を使わない", async () => {
    const d = deps({ wsOrigin: "wss://from-env.example" });
    const created = await handleCreateCollabSession(
      new Request("http://localhost/api/collab/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({
          localMapId: "local-1",
          documentJson: validDocumentJson(),
        }),
      }),
      d,
    );
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.value.wsUrl).toBe("wss://from-env.example/collab/id-1");
    expect(body.value.wsUrl).not.toContain("evil.example");
  });

  it("GET は所有者または参加者が見え、第三者は 404", async () => {
    const shareStore = createMemoryShareStore();
    const { sharedMapId } = await seedShareWithEditLink(shareStore);
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    const ownerDeps = deps({ shareStore, store, room, session: OWNER });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        sharedMapId,
        documentJson: validDocumentJson(),
      }),
      ownerDeps,
    );
    expect(created.status).toBe(200);

    const ownerGet = await handleGetCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1", "GET"),
      "id-1",
      ownerDeps,
    );
    expect(ownerGet.status).toBe(200);
    expect(ownerGet.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);

    const editorDeps = deps({ shareStore, store, room, session: EDITOR });
    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      editorDeps,
    );
    expect(joined.status).toBe(200);
    const editorGet = await handleGetCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1", "GET"),
      "id-1",
      editorDeps,
    );
    expect(editorGet.status).toBe(200);

    const otherDeps = deps({ shareStore, store, room, session: OTHER });
    const otherGet = await handleGetCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1", "GET"),
      "id-1",
      otherDeps,
    );
    expect(otherGet.status).toBe(404);
  });

  it("end 成功時は documentJson を返し session を ended にし artifact を残す", async () => {
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    const d = deps({ store, room });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(created.status).toBe(200);

    const end = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(end.status).toBe(200);
    const body = await end.json();
    expect(body.ok).toBe(true);
    expect(typeof body.value.documentJson).toBe("string");
    expect(body.value.documentJson.length).toBeGreaterThan(2);
    const session = await store.getSession("id-1");
    expect(session?.status).toBe("ended");
    expect(session?.artifactR2Key).toBeTruthy();
    expect(session?.endedAt).toBe("2026-11-27T12:00:00.000Z");
  });

  it("失敗応答やログ経路に ticket / token 平文を載せない", async () => {
    const shareStore = createMemoryShareStore();
    await seedShareWithEditLink(shareStore, { token: "super-secret-edit-token" });
    const d = deps({ shareStore, session: EDITOR });
    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", {
        token: "super-secret-edit-token",
      }),
      d,
    );
    const text = await joined.text();
    expect(text).not.toContain("super-secret-edit-token");
  });

  it("encode した Yjs update が room.seed に渡る（codec 利用）", async () => {
    const room = createMemoryRoom();
    const d = deps({ room });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(created.status).toBe(200);
    const update = room.seeded.get("id-1");
    expect(update).toBeInstanceOf(Uint8Array);
    expect(update!.byteLength).toBeGreaterThan(0);
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, update!);
    expect(ydoc.getMap("nodes").size).toBe(1);
  });

  it("401・429 とも Cache-Control: private, no-store", async () => {
    const unauth = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      deps({ session: null }),
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);

    const rateLimiter = createCollabRateLimiter({ limit: 1, windowMs: 60_000 });
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    const first = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      deps({ store, room, rateLimiter }),
    );
    expect(first.status).toBe(200);

    const limited = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-2",
        documentJson: validDocumentJson(),
      }),
      deps({ store, room, rateLimiter }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);
  });

  it("ticket 寿命は 60 秒固定（iat なし・exp === floor(nowSec)+60）", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      deps({ nowMs: () => nowMs }),
    );
    expect(created.status).toBe(200);
    const body = await created.json();
    const claims = verifyCollabTicket(body.value.ticket, TICKET_SECRET, nowMs);
    expect(claims).not.toBeNull();
    expect(claims!.exp).toBe(Math.floor(nowMs / 1000) + COLLAB_TICKET_TTL_SECONDS);
    expect(claims!).not.toHaveProperty("iat");
  });

  it("documentJson 欠落かつ seedFromArtifact でない開始は active にしない", async () => {
    const store = createMemoryCollabStore();
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
      }),
      deps({ store }),
    );
    expect(created.status).toBe(400);
    expect(await created.json()).toEqual({ ok: false, reason: "invalid-request" });
    expect(await store.findOpenByOwnerAndLocalMapId(OWNER!.userId, "local-1")).toBeNull();
  });

  it("sharedMapId なし（localMapId のみ）で開始が成功する", async () => {
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-only",
        documentJson: validDocumentJson(),
      }),
      deps(),
    );
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.ok).toBe(true);
    expect(body.value.sessionId).toBe("id-1");
    expect(typeof body.value.ticket).toBe("string");
    expect(body.value.wsUrl).toBe(`${WS_ORIGIN}/collab/id-1`);
  });

  it("成功応答の wsUrl に edit 共有トークンが含まれない", async () => {
    const shareStore = createMemoryShareStore();
    const { sharedMapId } = await seedShareWithEditLink(shareStore, {
      token: "edit-secret-token-xyz",
    });
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    const ownerDeps = deps({ shareStore, store, room, session: OWNER });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        sharedMapId,
        documentJson: validDocumentJson(),
      }),
      ownerDeps,
    );
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.value.wsUrl).not.toMatch(/edit-secret-token-xyz/);
    expect(createdBody.value.wsUrl).not.toContain("?");
    expect(createdBody.value.wsUrl).not.toContain("#");

    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", {
        token: "edit-secret-token-xyz",
      }),
      deps({ shareStore, store, room, session: EDITOR }),
    );
    expect(joined.status).toBe(200);
    const joinedBody = await joined.json();
    expect(joinedBody.value.wsUrl).not.toMatch(/edit-secret-token-xyz/);
    expect(joinedBody.value.wsUrl).not.toContain("?");
    expect(joinedBody.value.wsUrl).not.toContain("#");
  });

  it("ticket 再発行は owner／参加者の active のみ・旧 ticket 期限切れでも新 ticket は受理", async () => {
    const shareStore = createMemoryShareStore();
    const { sharedMapId } = await seedShareWithEditLink(shareStore);
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    let nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const ownerDeps = deps({
      shareStore,
      store,
      room,
      session: OWNER,
      nowMs: () => nowMs,
    });

    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        sharedMapId,
        documentJson: validDocumentJson(),
      }),
      ownerDeps,
    );
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    const oldTicket = createdBody.value.ticket as string;

    const editorDeps = deps({
      shareStore,
      store,
      room,
      session: EDITOR,
      nowMs: () => nowMs,
    });
    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      editorDeps,
    );
    expect(joined.status).toBe(200);

    // 旧 ticket を期限切れにする（発行から 61 秒）
    nowMs += 61_000;
    expect(verifyCollabTicket(oldTicket, TICKET_SECRET, nowMs)).toBeNull();

    const ownerReissue = await handleReissueCollabTicket(
      jsonRequest("http://localhost/api/collab/sessions/id-1/ticket", "POST"),
      "id-1",
      ownerDeps,
    );
    expect(ownerReissue.status).toBe(200);
    expect(ownerReissue.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);
    const ownerBody = await ownerReissue.json();
    expect(ownerBody.ok).toBe(true);
    expect(ownerBody.value.sessionId).toBe("id-1");
    expect(ownerBody.value.wsUrl).toBe(`${WS_ORIGIN}/collab/id-1`);
    const newOwnerTicket = ownerBody.value.ticket as string;
    expect(newOwnerTicket).not.toBe(oldTicket);
    const newOwnerClaims = verifyCollabTicket(newOwnerTicket, TICKET_SECRET, nowMs);
    expect(newOwnerClaims).toEqual({
      sessionId: "id-1",
      userId: OWNER!.userId,
      exp: Math.floor(nowMs / 1000) + COLLAB_TICKET_TTL_SECONDS,
    });

    const editorReissue = await handleReissueCollabTicket(
      jsonRequest("http://localhost/api/collab/sessions/id-1/ticket", "POST"),
      "id-1",
      editorDeps,
    );
    expect(editorReissue.status).toBe(200);
    const editorBody = await editorReissue.json();
    expect(verifyCollabTicket(editorBody.value.ticket, TICKET_SECRET, nowMs)).toEqual({
      sessionId: "id-1",
      userId: EDITOR!.userId,
      exp: Math.floor(nowMs / 1000) + COLLAB_TICKET_TTL_SECONDS,
    });

    const stranger = await handleReissueCollabTicket(
      jsonRequest("http://localhost/api/collab/sessions/id-1/ticket", "POST"),
      "id-1",
      deps({ shareStore, store, room, session: OTHER, nowMs: () => nowMs }),
    );
    expect(stranger.status).toBe(404);
    expect(stranger.headers.get("Cache-Control")).toBe(COLLAB_PRIVATE_NO_STORE);

    // ended では再発行不可
    const ended = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      ownerDeps,
    );
    expect(ended.status).toBe(200);
    expect(room.destroyed.has("id-1")).toBe(true);
    const afterEnd = await handleReissueCollabTicket(
      jsonRequest("http://localhost/api/collab/sessions/id-1/ticket", "POST"),
      "id-1",
      ownerDeps,
    );
    expect(afterEnd.status).toBe(404);
  });

  it("end 後は DO が destroy され再 export できない", async () => {
    const room = createMemoryRoom();
    const store = createMemoryCollabStore();
    const d = deps({ store, room });
    const created = await handleCreateCollabSession(
      jsonRequest("http://localhost/api/collab/sessions", "POST", {
        localMapId: "local-1",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(created.status).toBe(200);

    const ended = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(ended.status).toBe(200);
    expect(room.destroyed.has("id-1")).toBe(true);
    expect(await room.exportYjsUpdate("id-1")).toEqual({
      ok: false,
      reason: "export-failed",
    });
  });

  it("destroy 失敗時は end 全体が失敗し status は active に戻る", async () => {
    const room = createMemoryRoom({ destroyFail: true });
    const store = createMemoryCollabStore();
    const d = deps({ store, room });
    expect(
      (
        await handleCreateCollabSession(
          jsonRequest("http://localhost/api/collab/sessions", "POST", {
            localMapId: "local-1",
            documentJson: validDocumentJson(),
          }),
          d,
        )
      ).status,
    ).toBe(200);

    const ended = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(ended.status).toBe(502);
    expect(await ended.json()).toEqual({ ok: false, reason: "destroy-failed" });
    expect(room.destroyed.has("id-1")).toBe(false);
    expect((await store.getSession("id-1"))?.status).toBe("active");

    // destroy 成功に切り替えれば end を再試行できる
    room.setDestroyFail(false);
    const retried = await handleEndCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/end", "POST"),
      "id-1",
      d,
    );
    expect(retried.status).toBe(200);
    expect(room.destroyed.has("id-1")).toBe(true);
    expect((await store.getSession("id-1"))?.status).toBe("ended");
  });

  it("getConnectionCount 失敗時の join は fail-closed（429）", async () => {
    const shareStore = createMemoryShareStore();
    const { sharedMapId } = await seedShareWithEditLink(shareStore);
    const room = createMemoryRoom();
    room.setConnectionCountFail(true);
    const store = createMemoryCollabStore();
    const ownerDeps = deps({ shareStore, store, room, session: OWNER });
    expect(
      (
        await handleCreateCollabSession(
          jsonRequest("http://localhost/api/collab/sessions", "POST", {
            localMapId: "local-1",
            sharedMapId,
            documentJson: validDocumentJson(),
          }),
          ownerDeps,
        )
      ).status,
    ).toBe(200);

    const joined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      deps({ shareStore, store, room, session: EDITOR }),
    );
    expect(joined.status).toBe(429);
    expect(await joined.json()).toEqual({ ok: false, reason: "connection-limit" });
  });

  it("leave は D1 参加者を削除し枠を解放する", async () => {
    const shareStore = createMemoryShareStore();
    const { sharedMapId } = await seedShareWithEditLink(shareStore);
    const room = createMemoryRoom();
    const store = createMemoryCollabStore();
    const ownerDeps = deps({ shareStore, store, room, session: OWNER });
    expect(
      (
        await handleCreateCollabSession(
          jsonRequest("http://localhost/api/collab/sessions", "POST", {
            localMapId: "local-1",
            sharedMapId,
            documentJson: validDocumentJson(),
          }),
          ownerDeps,
        )
      ).status,
    ).toBe(200);

    const editorDeps = deps({ shareStore, store, room, session: EDITOR });
    expect(
      (
        await handleCollabJoin(
          jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
          editorDeps,
        )
      ).status,
    ).toBe(200);
    expect(await store.hasParticipant("id-1", EDITOR!.userId)).toBe(true);

    const left = await handleLeaveCollabSession(
      jsonRequest("http://localhost/api/collab/sessions/id-1/leave", "POST"),
      "id-1",
      editorDeps,
    );
    expect(left.status).toBe(200);
    expect(await store.hasParticipant("id-1", EDITOR!.userId)).toBe(false);

    // 退出後は再 join 可（累積上限にならない）
    const rejoined = await handleCollabJoin(
      jsonRequest("http://localhost/api/collab/join", "POST", { token: "edit-token-1" }),
      editorDeps,
    );
    expect(rejoined.status).toBe(200);
  });

  it("evacuate ingest は artifact 保存と ended 更新、空 body は拒否", async () => {
    const store = createMemoryCollabStore();
    const room = createMemoryRoom();
    const d = deps({ store, room });
    expect(
      (
        await handleCreateCollabSession(
          jsonRequest("http://localhost/api/collab/sessions", "POST", {
            localMapId: "local-1",
            documentJson: validDocumentJson(),
          }),
          d,
        )
      ).status,
    ).toBe(200);

    const empty = await handleCollabEvacuate(
      new Request("http://localhost/api/collab/evacuate", {
        method: "POST",
        headers: {
          Authorization: "Bearer svc-secret",
          "x-collab-session-id": "id-1",
        },
        body: new Uint8Array(),
      }),
      { ...d, serviceSecret: "svc-secret" },
    );
    expect(empty.status).toBe(502);
    expect(await empty.json()).toEqual({ ok: false, reason: "export-empty" });
    expect((await store.getSession("id-1"))?.status).toBe("active");

    const update = room.seeded.get("id-1")!;
    const updateBody = Buffer.from(update);
    const ok = await handleCollabEvacuate(
      new Request("http://localhost/api/collab/evacuate", {
        method: "POST",
        headers: {
          Authorization: "Bearer svc-secret",
          "content-type": "application/octet-stream",
          "x-collab-session-id": "id-1",
        },
        body: updateBody,
      }),
      { ...d, serviceSecret: "svc-secret" },
    );
    expect(ok.status).toBe(200);
    const session = await store.getSession("id-1");
    expect(session?.status).toBe("ended");
    expect(session?.artifactR2Key).toBeTruthy();
    expect(await store.getArtifact(session!.artifactR2Key!)).toEqual(update);

    const unauth = await handleCollabEvacuate(
      new Request("http://localhost/api/collab/evacuate", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong",
          "x-collab-session-id": "id-1",
        },
        body: updateBody,
      }),
      { ...d, serviceSecret: "svc-secret" },
    );
    expect(unauth.status).toBe(401);
  });
});
