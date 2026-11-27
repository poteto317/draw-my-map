/** @jest-environment node */

import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { ShareSession } from "@/domain/share/shareSession";
import { tokenHash } from "@/domain/share/tokenHash";
import {
  handleCreateShareLink,
  handleCreateShareMap,
  handleDeleteShareMap,
  handleListShareMaps,
  handlePublishShareMap,
  handleReissueShareLink,
  handleRevokeShareLink,
  handleViewShare,
  type ShareApiDeps,
} from "@/server/share/handleShareApi";
import { SHARE_MAX_BODY_BYTES } from "@/server/share/shareBody";
import type { ShareCommentStore } from "@/server/share/shareCommentStore";
import {
  createShareRateLimiter,
  SHARE_OWNER_RATE_LIMIT,
  SHARE_VIEW_RATE_LIMIT,
} from "@/server/share/shareRateLimit";
import { SHARE_VIEW_CACHE_CONTROL } from "@/server/share/shareResponses";
import { createMemoryShareCommentStore } from "@/server/share/testing/memoryShareCommentStore";
import {
  createMemoryShareStore,
  unusedClients,
} from "@/server/share/testing/memoryShareStore";
import { createTestNode } from "@/testing/createTestNode";

const OWNER: ShareSession = { userId: "user-1", email: "a@example.com" };
const OTHER: ShareSession = { userId: "user-2", email: "b@example.com" };
const SECRET = "test-token-secret";

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

function deps(overrides: Partial<ShareApiDeps> & { session?: ShareSession } = {}): ShareApiDeps {
  const clients = unusedClients();
  const { session = OWNER, ...rest } = overrides;
  return {
    getSession: async () => session,
    d1: clients.d1,
    r2: clients.r2,
    tokenSecret: SECRET,
    publicOrigin: "http://localhost:3000",
    store: createMemoryShareStore(),
    commentStore: createMemoryShareCommentStore(),
    // テストごとに新しい窓にする（プロセス共有の limiter をテスト間で使い切らない）
    ownerRateLimiter: createShareRateLimiter(SHARE_OWNER_RATE_LIMIT),
    viewRateLimiter: createShareRateLimiter(SHARE_VIEW_RATE_LIMIT),
    createId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
    createToken: (() => {
      let n = 0;
      return () => `token-${++n}`;
    })(),
    nowIso: () => "2026-11-26T00:00:00.000Z",
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

async function createShare(d: ShareApiDeps = deps()) {
  const response = await handleCreateShareMap(
    jsonRequest("http://localhost/api/share/maps", "POST", {
      localMapId: "local-1",
      title: "地図",
      documentJson: validDocumentJson(),
    }),
    d,
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    ok: true;
    value: {
      sharedMapId: string;
      link: { linkId: string; url: string; token: string; permission: string };
    };
  }>;
}

describe("Share API 契約", () => {
  it("未ログインの所有者 API は 401 ShareResult", async () => {
    const d = deps({ session: null });
    const list = await handleListShareMaps(jsonRequest("http://localhost/api/share/maps", "GET"), d);
    expect(list.status).toBe(401);
    expect(await list.json()).toEqual({ ok: false, reason: "unauthenticated" });

    const create = await handleCreateShareMap(
      jsonRequest("http://localhost/api/share/maps", "POST", {
        localMapId: "x",
        title: "t",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(create.status).toBe(401);
  });

  it("GET/POST /api/share/maps で一覧と初回共有（CreateShareValue）を返す", async () => {
    const store = createMemoryShareStore();
    const d = deps({ store });
    const created = await createShare(d);
    expect(created).toEqual({
      ok: true,
      value: {
        sharedMapId: "id-1",
        link: {
          linkId: "id-3",
          url: "http://localhost:3000/share/token-1",
          token: "token-1",
          permission: "view",
        },
      },
    });

    const list = await handleListShareMaps(jsonRequest("http://localhost/api/share/maps", "GET"), d);
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.ok).toBe(true);
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0].id).toBe("id-1");
    expect(listed.value[0].links[0].expiresAt).toBeNull();
  });

  it("同一 owner+localMapId の再 create は 409 already-exists（孤児二重作成を防ぐ）", async () => {
    const store = createMemoryShareStore();
    const d = deps({ store });
    const first = await createShare(d);
    expect(first.ok).toBe(true);

    const second = await handleCreateShareMap(
      jsonRequest("http://localhost/api/share/maps", "POST", {
        localMapId: "local-1",
        title: "地図（再）",
        documentJson: validDocumentJson(),
      }),
      d,
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ ok: false, reason: "already-exists" });

    const maps = await store.listMapsByOwner(OWNER!.userId);
    expect(maps).toHaveLength(1);
    expect(maps[0].id).toBe(first.value.sharedMapId);
  });

  it("他者の shared_maps / share_links 操作は 404", async () => {
    const store = createMemoryShareStore();
    const ownerDeps = deps({ store, session: OWNER });
    const created = await createShare(ownerDeps);

    const otherDeps = deps({ store, session: OTHER });
    const publish = await handlePublishShareMap(
      jsonRequest("http://localhost/api/share/maps/x/publish", "POST", {
        documentJson: validDocumentJson(),
      }),
      created.value.sharedMapId,
      otherDeps,
    );
    expect(publish.status).toBe(404);
    expect(await publish.json()).toEqual({ ok: false, reason: "not-found" });

    const revoke = await handleRevokeShareLink(
      jsonRequest("http://localhost/api/share/links/x/revoke", "POST"),
      created.value.link.linkId,
      otherDeps,
    );
    expect(revoke.status).toBe(404);

    const reissue = await handleReissueShareLink(
      jsonRequest("http://localhost/api/share/links/x/reissue", "POST"),
      created.value.link.linkId,
      otherDeps,
    );
    expect(reissue.status).toBe(404);

    const del = await handleDeleteShareMap(
      jsonRequest("http://localhost/api/share/maps/x", "DELETE"),
      created.value.sharedMapId,
      otherDeps,
    );
    expect(del.status).toBe(404);
  });

  it("壊れた documentJson / expires_at 指定は 400", async () => {
    const d = deps();
    const badDoc = await handleCreateShareMap(
      jsonRequest("http://localhost/api/share/maps", "POST", {
        localMapId: "l",
        title: "t",
        documentJson: "{not-json",
      }),
      d,
    );
    expect(badDoc.status).toBe(400);
    expect(await badDoc.json()).toEqual({ ok: false, reason: "invalid-document" });

    const withExpiry = await handleCreateShareMap(
      jsonRequest("http://localhost/api/share/maps", "POST", {
        localMapId: "l",
        title: "t",
        documentJson: validDocumentJson(),
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      d,
    );
    expect(withExpiry.status).toBe(400);
    expect(await withExpiry.json()).toEqual({ ok: false, reason: "invalid-request" });
  });

  it("publish / links / revoke / reissue / view の成功契約", async () => {
    const store = createMemoryShareStore();
    const d = deps({ store });
    const created = await createShare(d);

    const published = await handlePublishShareMap(
      jsonRequest("http://localhost/api/share/maps/id/publish", "POST", {
        documentJson: validDocumentJson(),
      }),
      created.value.sharedMapId,
      d,
    );
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({
      ok: true,
      value: { revisionId: expect.any(String) },
    });

    const linked = await handleCreateShareLink(
      jsonRequest("http://localhost/api/share/maps/id/links", "POST", {}),
      created.value.sharedMapId,
      d,
    );
    expect(linked.status).toBe(200);
    const linkBody = await linked.json();
    expect(linkBody.ok).toBe(true);
    expect(linkBody.value.url).toContain("/share/");
    expect(linkBody.value.token).toBeTruthy();

    const viewOk = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${created.value.link.token}`, "GET"),
      created.value.link.token,
      d,
    );
    expect(viewOk.status).toBe(200);
    const viewed = await viewOk.json();
    expect(viewed.ok).toBe(true);
    expect(typeof viewed.value.documentJson).toBe("string");

    const reissued = await handleReissueShareLink(
      jsonRequest("http://localhost/api/share/links/id/reissue", "POST"),
      created.value.link.linkId,
      d,
    );
    expect(reissued.status).toBe(200);
    const newLink = await reissued.json();
    expect(newLink.ok).toBe(true);
    expect(newLink.value.token).not.toBe(created.value.link.token);

    const oldView = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${created.value.link.token}`, "GET"),
      created.value.link.token,
      d,
    );
    expect(oldView.status).toBe(404);

    const newView = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${newLink.value.token}`, "GET"),
      newLink.value.token,
      d,
    );
    expect(newView.status).toBe(200);

    await handleRevokeShareLink(
      jsonRequest("http://localhost/api/share/links/id/revoke", "POST"),
      newLink.value.linkId,
      d,
    );
    const revokedView = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${newLink.value.token}`, "GET"),
      newLink.value.token,
      d,
    );
    expect(revokedView.status).toBe(404);
    expect(await revokedView.json()).toEqual({ ok: false, reason: "not-found" });
  });

  it("不明トークンと失効は HTTP 404", async () => {
    const d = deps();
    const miss = await handleViewShare(
      jsonRequest("http://localhost/api/share/view/nope", "GET"),
      "nope",
      d,
    );
    expect(miss.status).toBe(404);
  });

  it("GET view は成功・404 とも Cache-Control: private, no-store と Referrer-Policy: no-referrer", async () => {
    const store = createMemoryShareStore();
    const d = deps({ store });
    const created = await createShare(d);

    const ok = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${created.value.link.token}`, "GET"),
      created.value.link.token,
      d,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe(SHARE_VIEW_CACHE_CONTROL);
    expect(ok.headers.get("Referrer-Policy")).toBe("no-referrer");

    const miss = await handleViewShare(
      jsonRequest("http://localhost/api/share/view/missing-token", "GET"),
      "missing-token",
      d,
    );
    expect(miss.status).toBe(404);
    expect(miss.headers.get("Cache-Control")).toBe(SHARE_VIEW_CACHE_CONTROL);
    expect(miss.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("viewByToken で contentSha256 不一致は storage-error（文書を返さない）", async () => {
    const store = createMemoryShareStore();
    const d = deps({ store });
    const created = await createShare(d);
    const map = await store.getMap(created.value.sharedMapId);
    expect(map?.currentRevisionId).toBeTruthy();
    const revision = await store.getRevision(map!.currentRevisionId!);
    expect(revision).not.toBeNull();

    await store.putDocument(revision!.r2Key, new TextEncoder().encode('{"tampered":true}'));

    const view = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${created.value.link.token}`, "GET"),
      created.value.link.token,
      d,
    );
    expect(view.status).toBe(502);
    expect(await view.json()).toEqual({ ok: false, reason: "storage-error" });
  });

  it("未共有（revision 無し）への追加リンクは拒否", async () => {
    const store = createMemoryShareStore();
    await store.insertMap({
      id: "map-unpub",
      ownerUserId: OWNER!.userId,
      localMapId: "l",
      title: "t",
      currentRevisionId: null,
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
    });
    const d = deps({ store });
    const response = await handleCreateShareLink(
      jsonRequest("http://localhost/api/share/maps/map-unpub/links", "POST", {}),
      "map-unpub",
      d,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, reason: "not-published" });
  });

  it("DELETE は失効→current null→R2削除→DB削除の順で成功する", async () => {
    const store = createMemoryShareStore();
    const order: string[] = [];
    let recording = false;
    const wrapped: typeof store = {
      ...store,
      async revokeAllLinksByMap(id, at) {
        if (recording) order.push("revoke");
        return store.revokeAllLinksByMap(id, at);
      },
      async setCurrentRevision(id, rev, at) {
        if (recording) order.push(`current:${rev}`);
        return store.setCurrentRevision(id, rev, at);
      },
      async deleteDocument(key) {
        if (recording) order.push(`r2:${key}`);
        return store.deleteDocument(key);
      },
      async deleteLinksByMap(id) {
        if (recording) order.push("db-links");
        return store.deleteLinksByMap(id);
      },
      async deleteRevisionsByMap(id) {
        if (recording) order.push("db-revisions");
        return store.deleteRevisionsByMap(id);
      },
      async deleteMap(id) {
        if (recording) order.push("db-map");
        return store.deleteMap(id);
      },
    };
    const d = deps({ store: wrapped });
    const created = await createShare(d);
    recording = true;
    const response = await handleDeleteShareMap(
      jsonRequest("http://localhost/api/share/maps/id", "DELETE"),
      created.value.sharedMapId,
      d,
    );
    expect(response.status).toBe(200);
    expect(order[0]).toBe("revoke");
    expect(order[1]).toBe("current:null");
    expect(order.some((s) => s.startsWith("r2:"))).toBe(true);
    expect(order.indexOf("db-map")).toBeGreaterThan(order.indexOf("db-revisions"));
    expect(await store.getMap(created.value.sharedMapId)).toBeNull();
  });

  it("本文サイズ上限超過は 413 too-large", async () => {
    const d = deps({ maxBodyBytes: 64 });
    const response = await handleCreateShareMap(
      new Request("http://localhost/api/share/maps", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(SHARE_MAX_BODY_BYTES + 1) },
        body: "x".repeat(100),
      }),
      d,
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, reason: "too-large" });
  });

  it("所有者 API のレート制限超過は 429", async () => {
    const limiter = createShareRateLimiter({ limit: 1, windowMs: 60_000 });
    const d = deps({ ownerRateLimiter: limiter });
    const first = await handleListShareMaps(jsonRequest("http://localhost/api/share/maps", "GET"), d);
    expect(first.status).toBe(200);
    const second = await handleListShareMaps(jsonRequest("http://localhost/api/share/maps", "GET"), d);
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("view API のレート制限超過は 429（viewRateLimiter）", async () => {
    const viewRateLimiter = createShareRateLimiter({ limit: 1, windowMs: 60_000 });
    const d = deps({ viewRateLimiter });
    const first = await handleViewShare(
      jsonRequest("http://localhost/api/share/view/tok", "GET"),
      "tok",
      d,
    );
    // 不明トークンでもレート判定は先に走る（1 回目は 404、2 回目は 429）
    expect(first.status).toBe(404);
    const second = await handleViewShare(
      jsonRequest("http://localhost/api/share/view/tok", "GET"),
      "tok",
      d,
    );
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("view API は異なるトークンでも同一 IP ならレート制限する", async () => {
    const viewRateLimiter = createShareRateLimiter({ limit: 1, windowMs: 60_000 });
    const d = deps({ viewRateLimiter });
    const first = await handleViewShare(
      new Request("http://localhost/api/share/view/tok-a", {
        method: "GET",
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      "tok-a",
      d,
    );
    expect(first.status).toBe(404);
    const second = await handleViewShare(
      new Request("http://localhost/api/share/view/tok-b", {
        method: "GET",
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      "tok-b",
      d,
    );
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("view API は IP が違えば別バケット（token 単位制限は維持）", async () => {
    const viewRateLimiter = createShareRateLimiter({ limit: 1, windowMs: 60_000 });
    const d = deps({ viewRateLimiter });
    const a = await handleViewShare(
      new Request("http://localhost/api/share/view/same-tok", {
        method: "GET",
        headers: { "cf-connecting-ip": "203.0.113.1" },
      }),
      "same-tok",
      d,
    );
    expect(a.status).toBe(404);
    const b = await handleViewShare(
      new Request("http://localhost/api/share/view/same-tok", {
        method: "GET",
        headers: { "cf-connecting-ip": "203.0.113.2" },
      }),
      "same-tok",
      d,
    );
    // 同一 tokenHash なので IP が違っても token 側で 429
    expect(b.status).toBe(429);
  });

  it("d1/r2 は deps 経由で注入され、store 未指定時に createCloudflareShareStore 経路を使う", async () => {
    const clients = unusedClients();
    clients.d1.exec.mockResolvedValue({ results: [], meta: undefined });
    const d: ShareApiDeps = {
      getSession: async () => OWNER,
      d1: clients.d1,
      r2: clients.r2,
      tokenSecret: SECRET,
      publicOrigin: "http://localhost:3000",
      // store なし → d1 が呼ばれる
    };
    const response = await handleListShareMaps(
      jsonRequest("http://localhost/api/share/maps", "GET"),
      d,
    );
    expect(response.status).toBe(200);
    expect(clients.d1.exec).toHaveBeenCalled();
  });
});

describe("Share API 部分失敗", () => {
  it("初回共有で R2 失敗時は成功応答も行も残さない", async () => {
    const store = createMemoryShareStore();
    const flaky: typeof store = {
      ...store,
      async putDocument() {
        throw new Error("r2-down");
      },
    };
    const response = await handleCreateShareMap(
      jsonRequest("http://localhost/api/share/maps", "POST", {
        localMapId: "l",
        title: "t",
        documentJson: validDocumentJson(),
      }),
      deps({ store: flaky }),
    );
    expect(response.status).toBe(502);
    expect(await store.getMap("id-1")).toBeNull();
  });

  it("初回共有ロールバックは current null を先に行う", async () => {
    const store = createMemoryShareStore();
    const order: string[] = [];
    const flaky: typeof store = {
      ...store,
      async setCurrentRevision(id, rev, at) {
        order.push(`current:${rev}`);
        return store.setCurrentRevision(id, rev, at);
      },
      async insertLink() {
        throw new Error("link-fail");
      },
      async deleteLinksByMap(id) {
        order.push("delete-links");
        return store.deleteLinksByMap(id);
      },
      async deleteRevisionsByMap(id) {
        order.push("delete-revisions");
        return store.deleteRevisionsByMap(id);
      },
      async deleteDocument(key) {
        order.push(`delete-r2:${key}`);
        return store.deleteDocument(key);
      },
      async deleteMap(id) {
        order.push("delete-map");
        return store.deleteMap(id);
      },
    };
    const response = await handleCreateShareMap(
      jsonRequest("http://localhost/api/share/maps", "POST", {
        localMapId: "l",
        title: "t",
        documentJson: validDocumentJson(),
      }),
      deps({ store: flaky }),
    );
    expect(response.status).toBe(502);
    const nullAt = order.indexOf("current:null");
    expect(nullAt).toBeGreaterThanOrEqual(0);
    expect(nullAt).toBeLessThan(order.indexOf("delete-links"));
    expect(nullAt).toBeLessThan(order.indexOf("delete-revisions"));
    expect(nullAt).toBeLessThan(order.indexOf("delete-map"));
  });

  it("publish 途中失敗でも旧 current_revision_id を維持する", async () => {
    const store = createMemoryShareStore();
    const d = deps({ store });
    const created = await createShare(d);
    const before = await store.getMap(created.value.sharedMapId);
    expect(before?.currentRevisionId).toBe("id-2");

    const flaky: typeof store = {
      ...store,
      async putDocument() {
        throw new Error("r2-down");
      },
    };
    const response = await handlePublishShareMap(
      jsonRequest("http://localhost/api/share/maps/id/publish", "POST", {
        documentJson: validDocumentJson(),
      }),
      created.value.sharedMapId,
      deps({ store: flaky }),
    );
    expect(response.status).toBe(502);
    const after = await store.getMap(created.value.sharedMapId);
    expect(after?.currentRevisionId).toBe("id-2");
  });
});

describe("Share API 再発行の失敗隔離", () => {
  it("新リンク insert が失敗したら旧トークンで view できる", async () => {
    const base = createMemoryShareStore();
    const d0 = deps({ store: base });
    const created = await createShare(d0);
    const oldToken = created.value.link.token;

    const flaky: ReturnType<typeof createMemoryShareStore> = {
      ...base,
      async insertLink() {
        throw new Error("boom");
      },
    };
    const fail = await handleReissueShareLink(
      jsonRequest("http://localhost/api/share/links/id/reissue", "POST"),
      created.value.link.linkId,
      deps({ store: flaky }),
    );
    expect(fail.status).toBe(502);

    const view = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${oldToken}`, "GET"),
      oldToken,
      deps({ store: base }),
    );
    expect(view.status).toBe(200);
  });

  it("旧 revoke 失敗時は新リンクを削除して二重有効を防ぐ", async () => {
    const base = createMemoryShareStore();
    const createId = (() => {
      let n = 0;
      return () => `id-${++n}`;
    })();
    const createToken = (() => {
      let n = 0;
      return () => `token-${++n}`;
    })();
    const created = await createShare(deps({ store: base, createId, createToken }));
    const oldToken = created.value.link.token;
    const deletedIds: string[] = [];

    const flaky: ReturnType<typeof createMemoryShareStore> = {
      ...base,
      async revokeLink() {
        throw new Error("revoke-fail");
      },
      async deleteLink(id) {
        deletedIds.push(id);
        return base.deleteLink(id);
      },
    };

    const fail = await handleReissueShareLink(
      jsonRequest("http://localhost/api/share/links/id/reissue", "POST"),
      created.value.link.linkId,
      deps({ store: flaky, createId, createToken }),
    );
    expect(fail.status).toBe(502);
    expect(deletedIds).toEqual(["id-4"]); // create で id-1..3、reissue 新リンク id-4

    const oldView = await handleViewShare(
      jsonRequest(`http://localhost/api/share/view/${oldToken}`, "GET"),
      oldToken,
      deps({ store: base }),
    );
    expect(oldView.status).toBe(200);
    expect(await base.listLinksByMap(created.value.sharedMapId)).toHaveLength(1);
  });
});

async function createLink(d: ShareApiDeps, sharedMapId: string, body: unknown) {
  return handleCreateShareLink(
    jsonRequest(
      `http://localhost/api/share/maps/${sharedMapId}/links`,
      "POST",
      body,
    ),
    sharedMapId,
    d,
  );
}

async function viewShare(d: ShareApiDeps, token: string) {
  return handleViewShare(
    jsonRequest(`http://localhost/api/share/view/${token}`, "GET"),
    token,
    d,
  );
}

async function reissueLink(d: ShareApiDeps, linkId: string) {
  return handleReissueShareLink(
    jsonRequest(`http://localhost/api/share/links/${linkId}/reissue`, "POST"),
    linkId,
    d,
  );
}

async function listedLinks(d: ShareApiDeps) {
    const list = await handleListShareMaps(jsonRequest("http://localhost/api/share/maps", "GET"), d);
  const body = (await list.json()) as {
    ok: true;
    value: Array<{
      links: Array<{
        id: string;
        permission: string;
        revokedAt: string | null;
      }>;
    }>;
  };
  return body.value[0].links;
}

describe("Share API の comment リンク", () => {
  it("permission: comment のリンクを発行できる", async () => {
    const d = deps();
    const created = await createShare(d);
    const response = await createLink(d, created.value.sharedMapId, {
      permission: "comment",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.value.permission).toBe("comment");
  });

  it("permission 省略時は view で発行する", async () => {
    const d = deps();
    const created = await createShare(d);
    const response = await createLink(d, created.value.sharedMapId, {});
    expect(response.status).toBe(200);
    expect((await response.json()).value.permission).toBe("view");
  });

  it.each<unknown>(["edit", "View", " view", "", ["comment"], 123, null, {}])(
    "permission: %p のリンク発行は 400 invalid-permission",
    async (permission) => {
      const store = createMemoryShareStore();
      const d = deps({ store });
      const created = await createShare(d);
      const response = await createLink(d, created.value.sharedMapId, {
        permission,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        reason: "invalid-permission",
      });
      expect(
        await store.listLinksByMap(created.value.sharedMapId),
      ).toHaveLength(1);
    },
  );

  it("comment リンクを再発行すると新リンクも comment（成功値と一覧）", async () => {
    const d = deps();
    const created = await createShare(d);
    const linked = await (
      await createLink(d, created.value.sharedMapId, { permission: "comment" })
    ).json();

    const reissued = await reissueLink(d, linked.value.linkId);
    expect(reissued.status).toBe(200);
    const body = await reissued.json();
    expect(body.value.permission).toBe("comment");

    const links = await listedLinks(d);
    const fresh = links.find((link) => link.id === body.value.linkId);
    expect(fresh).toMatchObject({ permission: "comment", revokedAt: null });
  });

  it("view リンクを再発行すると新リンクも view", async () => {
    const d = deps();
    const created = await createShare(d);
    const reissued = await reissueLink(d, created.value.link.linkId);
    expect(reissued.status).toBe(200);
    const body = await reissued.json();
    expect(body.value.permission).toBe("view");
    const links = await listedLinks(d);
    expect(
      links.find((link) => link.id === body.value.linkId)?.permission,
    ).toBe("view");
  });

  it("view 応答に permission を含め、comment リンクでも文書を返す", async () => {
    const d = deps();
    const created = await createShare(d);
    const viewRes = await viewShare(d, created.value.link.token);
    expect(viewRes.status).toBe(200);
    const viewed = await viewRes.json();
    expect(viewed.value.permission).toBe("view");
    expect(typeof viewed.value.documentJson).toBe("string");

    const linked = await (
      await createLink(d, created.value.sharedMapId, { permission: "comment" })
    ).json();
    const commentRes = await viewShare(d, linked.value.token);
    expect(commentRes.status).toBe(200);
    const commentViewed = await commentRes.json();
    expect(commentViewed.value.permission).toBe("comment");
    expect(commentViewed.value.documentJson).toBe(viewed.value.documentJson);
  });

  it("未知の permission（edit）の行のトークンは view 404、再発行も 404 で行が変わらない", async () => {
    const store = createMemoryShareStore();
    const d = deps({ store });
    const created = await createShare(d);
    await store.insertLink({
      id: "link-edit",
      sharedMapId: created.value.sharedMapId,
      tokenHash: tokenHash("edit-token", SECRET),
      permission: "edit",
      createdAt: "2026-11-26T00:00:00.000Z",
      revokedAt: null,
      expiresAt: null,
    });

    const viewRes = await viewShare(d, "edit-token");
    expect(viewRes.status).toBe(404);
    expect(await viewRes.json()).toEqual({ ok: false, reason: "not-found" });

    const before = await store.listLinksByMap(created.value.sharedMapId);
    const reissued = await reissueLink(d, "link-edit");
    expect(reissued.status).toBe(404);
    expect(await reissued.json()).toEqual({ ok: false, reason: "not-found" });
    const after = await store.listLinksByMap(created.value.sharedMapId);
    expect(after).toEqual(before);
    expect(after.find((link) => link.id === "link-edit")?.revokedAt).toBeNull();
  });
});

describe("Share API 共有解除とコメント", () => {
  function seedComments(
    commentStore: ReturnType<typeof createMemoryShareCommentStore>,
    sharedMapId: string,
  ) {
    commentStore.threads.push({
      id: `thread-${sharedMapId}`,
      sharedMapId,
      nodeId: 1,
      nodeLabelSnapshot: "根",
      status: "open",
      createdByUserId: "user-9",
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
      resolvedByUserId: null,
      resolvedByName: null,
      resolvedAt: null,
    });
    commentStore.comments.push({
      id: `comment-${sharedMapId}`,
      threadId: `thread-${sharedMapId}`,
      sharedMapId,
      authorUserId: "user-9",
      authorName: "閲覧者",
      body: "本文",
      createdAt: "2026-11-26T00:00:00.000Z",
    });
  }

  async function deleteShare(d: ShareApiDeps, sharedMapId: string) {
    return handleDeleteShareMap(
      jsonRequest(`http://localhost/api/share/maps/${sharedMapId}`, "DELETE"),
      sharedMapId,
      d,
    );
  }

  it("共有解除でそのマップのコメントとスレッドを消し、別マップの行は残す", async () => {
    const commentStore = createMemoryShareCommentStore();
    const store = createMemoryShareStore();
    const d = deps({ store, commentStore });
    const created = await createShare(d);
    seedComments(commentStore, created.value.sharedMapId);
    seedComments(commentStore, "other-map");

    const response = await deleteShare(d, created.value.sharedMapId);
    expect(response.status).toBe(200);
    expect(commentStore.threads.map((t) => t.sharedMapId)).toEqual([
      "other-map",
    ]);
    expect(commentStore.comments.map((c) => c.sharedMapId)).toEqual([
      "other-map",
    ]);
    expect(await store.getMap(created.value.sharedMapId)).toBeNull();
  });

  it("コメント削除はリビジョン削除の後・マップ削除の前に、コメント→スレッドの順で行う", async () => {
    const store = createMemoryShareStore();
    const base = createMemoryShareCommentStore();
    const order: string[] = [];
    let recording = false;
    const commentStore: ShareCommentStore = {
      ...base,
      async deleteCommentsByMap(id) {
        if (recording) order.push("comments");
        return base.deleteCommentsByMap(id);
      },
      async deleteThreadsByMap(id) {
        if (recording) order.push("threads");
        return base.deleteThreadsByMap(id);
      },
    };
    const wrapped: typeof store = {
      ...store,
      async deleteRevisionsByMap(id) {
        if (recording) order.push("db-revisions");
        return store.deleteRevisionsByMap(id);
      },
      async deleteMap(id) {
        if (recording) order.push("db-map");
        return store.deleteMap(id);
      },
    };
    const d = deps({ store: wrapped, commentStore });
    const created = await createShare(d);
    recording = true;
    const response = await deleteShare(d, created.value.sharedMapId);
    expect(response.status).toBe(200);
    expect(order).toEqual(["db-revisions", "comments", "threads", "db-map"]);
  });

  it("コメントの表が無い（DDL 未実行）ときも共有解除は 200", async () => {
    const store = createMemoryShareStore();
    const d = deps({
      store,
      commentStore: createMemoryShareCommentStore({ missingTables: true }),
    });
    const created = await createShare(d);
    const response = await deleteShare(d, created.value.sharedMapId);
    expect(response.status).toBe(200);
    expect(await store.getMap(created.value.sharedMapId)).toBeNull();
  });

  it.each(["deleteCommentsByMap", "deleteThreadsByMap"] as const)(
    "%s が失敗したら共有解除は 502 storage-error でマップ行を残す",
    async (method) => {
      const store = createMemoryShareStore();
      const d = deps({
        store,
        commentStore: createMemoryShareCommentStore({ failOnce: [method] }),
      });
      const created = await createShare(d);
      const response = await deleteShare(d, created.value.sharedMapId);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        ok: false,
        reason: "storage-error",
      });
      expect(await store.getMap(created.value.sharedMapId)).not.toBeNull();
    },
  );

  it("コメント削除の失敗で 502 になった後、同じ共有解除を再実行すると 200 で完了する", async () => {
    const store = createMemoryShareStore();
    const commentStore = createMemoryShareCommentStore({
      failOnce: ["deleteCommentsByMap"],
    });
    const d = deps({ store, commentStore });
    const created = await createShare(d);
    const sharedMapId = created.value.sharedMapId;
    seedComments(commentStore, sharedMapId);

    const failed = await deleteShare(d, sharedMapId);
    expect(failed.status).toBe(502);
    expect(await store.getMap(sharedMapId)).not.toBeNull();

    const retried = await deleteShare(d, sharedMapId);
    expect(retried.status).toBe(200);
    expect(await store.getMap(sharedMapId)).toBeNull();
    expect(commentStore.comments).toEqual([]);
    expect(commentStore.threads).toEqual([]);
  });
});
