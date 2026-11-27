/** @jest-environment node */

import type {
  ShareCommentListValue,
  ShareCommentThreadView,
  ShareCommentsScope,
} from "@/domain/share/shareComment";
import {
  createShareCommentsApiClient,
  shareCommentsBasePath,
} from "@/services/share/shareCommentsApiClient";

const TOKEN_SCOPE: ShareCommentsScope = { kind: "token", token: "a/b?c" };
const OWNER_SCOPE: ShareCommentsScope = { kind: "owner", sharedMapId: "sm/1?x" };

const THREAD: ShareCommentThreadView = {
  id: "th-1",
  nodeId: 3,
  nodeLabelSnapshot: "ラベル",
  status: "open",
  resolvedByName: null,
  resolvedAt: null,
  createdAt: "2026-11-27T00:00:00.000Z",
  updatedAt: "2026-11-27T00:00:00.000Z",
  canResolve: true,
  comments: [],
};

const LIST: ShareCommentListValue = {
  threads: [THREAD],
  viewer: { signedIn: true, canPost: true, isOwner: false },
};

type Call = { url: string; init: RequestInit | undefined };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function recordingFetch(response: () => Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

describe("shareCommentsBasePath", () => {
  it("token 経路は /api/share/view/<encodeURIComponent(token)>", () => {
    expect(shareCommentsBasePath(TOKEN_SCOPE)).toBe("/api/share/view/a%2Fb%3Fc");
  });

  it("owner 経路は /api/share/maps/<encodeURIComponent(sharedMapId)>", () => {
    expect(shareCommentsBasePath(OWNER_SCOPE)).toBe("/api/share/maps/sm%2F1%3Fx");
  });
});

describe("createShareCommentsApiClient", () => {
  it.each([
    ["token", TOKEN_SCOPE, "/api/share/view/a%2Fb%3Fc"],
    ["owner", OWNER_SCOPE, "/api/share/maps/sm%2F1%3Fx"],
  ] as const)("list（%s）は GET {base}/comment-threads で本文なし", async (_label, scope, base) => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ ok: true, value: LIST }));
    const client = createShareCommentsApiClient(fetchImpl);
    await expect(client.list(scope)).resolves.toEqual({ ok: true, value: LIST });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${base}/comment-threads`);
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.body).toBeUndefined();
  });

  it.each([
    ["token", TOKEN_SCOPE, "/api/share/view/a%2Fb%3Fc"],
    ["owner", OWNER_SCOPE, "/api/share/maps/sm%2F1%3Fx"],
  ] as const)("createThread（%s）は POST {base}/comment-threads に JSON 本文", async (_label, scope, base) => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ ok: true, value: THREAD }));
    const client = createShareCommentsApiClient(fetchImpl);
    await expect(client.createThread(scope, { nodeId: 3, body: "本文" })).resolves.toEqual({
      ok: true,
      value: THREAD,
    });
    expect(calls[0].url).toBe(`${base}/comment-threads`);
    expect(calls[0].init?.method).toBe("POST");
    expect(headerOf(calls[0].init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ nodeId: 3, body: "本文" });
  });

  it("reply は POST {base}/comment-threads/<id>/replies に { body } だけを送る", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ ok: true, value: THREAD }));
    const client = createShareCommentsApiClient(fetchImpl);
    await expect(client.reply(TOKEN_SCOPE, "th/1?", { body: "返信" })).resolves.toEqual({
      ok: true,
      value: THREAD,
    });
    expect(calls[0].url).toBe("/api/share/view/a%2Fb%3Fc/comment-threads/th%2F1%3F/replies");
    expect(calls[0].init?.method).toBe("POST");
    expect(headerOf(calls[0].init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ body: "返信" });
  });

  it.each([
    ["resolve", "resolve"],
    ["reopen", "reopen"],
  ] as const)("%s は POST {base}/comment-threads/<id>/%s で本文なし", async (method, segment) => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ ok: true, value: THREAD }));
    const client = createShareCommentsApiClient(fetchImpl);
    await expect(client[method](OWNER_SCOPE, "th/1?")).resolves.toEqual({ ok: true, value: THREAD });
    expect(calls[0].url).toBe(`/api/share/maps/sm%2F1%3Fx/comment-threads/th%2F1%3F/${segment}`);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("deleteComment は DELETE {base}/comments/<id> で本文なし", async () => {
    const value = { commentId: "c/1", threadDeleted: true };
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ ok: true, value }));
    const client = createShareCommentsApiClient(fetchImpl);
    await expect(client.deleteComment(TOKEN_SCOPE, "c/1?")).resolves.toEqual({ ok: true, value });
    expect(calls[0].url).toBe("/api/share/view/a%2Fb%3Fc/comments/c%2F1%3F");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("失敗応答の reason をそのまま返す", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ ok: false, reason: "thread-resolved" }, 409));
    const client = createShareCommentsApiClient(fetchImpl);
    await expect(client.reply(TOKEN_SCOPE, "th-1", { body: "x" })).resolves.toEqual({
      ok: false,
      reason: "thread-resolved",
    });
  });

  it("fetch の例外はすべての操作で network-error", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const client = createShareCommentsApiClient(fetchImpl);
    const networkError = { ok: false, reason: "network-error" };
    await expect(client.list(TOKEN_SCOPE)).resolves.toEqual(networkError);
    await expect(client.createThread(TOKEN_SCOPE, { nodeId: 1, body: "x" })).resolves.toEqual(networkError);
    await expect(client.reply(TOKEN_SCOPE, "th-1", { body: "x" })).resolves.toEqual(networkError);
    await expect(client.resolve(TOKEN_SCOPE, "th-1")).resolves.toEqual(networkError);
    await expect(client.reopen(TOKEN_SCOPE, "th-1")).resolves.toEqual(networkError);
    await expect(client.deleteComment(TOKEN_SCOPE, "c-1")).resolves.toEqual(networkError);
  });

  it("JSON でない応答や ok の無い応答は invalid-response", async () => {
    const notJson = createShareCommentsApiClient(
      (async () => new Response("<html>", { status: 502 })) as typeof fetch,
    );
    await expect(notJson.list(OWNER_SCOPE)).resolves.toEqual({ ok: false, reason: "invalid-response" });
    const noOk = createShareCommentsApiClient(
      (async () => jsonResponse({ value: LIST })) as typeof fetch,
    );
    await expect(noOk.list(OWNER_SCOPE)).resolves.toEqual({ ok: false, reason: "invalid-response" });
  });
});
