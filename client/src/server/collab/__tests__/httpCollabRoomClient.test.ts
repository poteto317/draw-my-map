/** @jest-environment node */

import { createHttpCollabRoomClient } from "@/server/collab/httpCollabRoomClient";

describe("httpCollabRoomClient", () => {
  it("seed は POST /rooms/:id/seed にバイナリを送り成功を返す", async () => {
    const calls: Array<{ url: string; method: string; auth?: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        auth: (init?.headers as Record<string, string>)?.Authorization ?? null,
      });
      return new Response(null, { status: 204 });
    };

    const client = createHttpCollabRoomClient({
      origin: "wss://collab.example.test",
      serviceSecret: "svc-secret",
      fetchImpl,
    });
    const body = new Uint8Array([1, 2, 3]);
    expect(await client.seed("s1", body)).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("https://collab.example.test/rooms/s1/seed");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.auth).toBe("Bearer svc-secret");
  });

  it("seed 失敗は seed-failed", async () => {
    const client = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () => new Response(null, { status: 500 }),
    });
    expect(await client.seed("s1", new Uint8Array([1]))).toEqual({
      ok: false,
      reason: "seed-failed",
    });
  });

  it("export 成功・空・失敗を区別する", async () => {
    const okClient = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () =>
        new Response(new Uint8Array([9, 9]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    });
    const exported = await okClient.exportYjsUpdate("s1");
    expect(exported.ok).toBe(true);
    if (exported.ok) expect([...exported.value]).toEqual([9, 9]);

    const empty = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () => new Response(null, { status: 404 }),
    });
    expect(await empty.exportYjsUpdate("s1")).toEqual({
      ok: false,
      reason: "export-empty",
    });

    const fail = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () => new Response(null, { status: 500 }),
    });
    expect(await fail.exportYjsUpdate("s1")).toEqual({
      ok: false,
      reason: "export-failed",
    });
  });

  it("getConnectionCount を返す", async () => {
    const client = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () =>
        new Response(JSON.stringify({ count: 3 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(await client.getConnectionCount("s1")).toEqual({ ok: true, value: 3 });
  });

  it("getConnectionCount 失敗は fail-closed（0 に倒さない）", async () => {
    const httpFail = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () => new Response(null, { status: 500 }),
    });
    expect(await httpFail.getConnectionCount("s1")).toEqual({
      ok: false,
      reason: "connection-count-failed",
    });

    const badJson = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(await badJson.getConnectionCount("s1")).toEqual({
      ok: false,
      reason: "connection-count-failed",
    });

    const networkFail = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async () => {
        throw new Error("network");
      },
    });
    expect(await networkFail.getConnectionCount("s1")).toEqual({
      ok: false,
      reason: "connection-count-failed",
    });
  });

  it("destroy は POST /rooms/:id/destroy", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const client = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), method: init?.method ?? "GET" });
        return new Response(null, { status: 204 });
      },
    });
    await client.destroy("s1");
    expect(calls).toEqual([
      { url: "https://collab.example.test/rooms/s1/destroy", method: "POST" },
    ]);
  });

  it("Authorization ヘッダに ticket 平文を載せない（service secret のみ）", async () => {
    const headersSeen: string[] = [];
    const client = createHttpCollabRoomClient({
      origin: "https://collab.example.test",
      serviceSecret: "svc-only",
      fetchImpl: async (_input, init) => {
        const h = init?.headers as Record<string, string>;
        headersSeen.push(JSON.stringify(h));
        return new Response(null, { status: 204 });
      },
    });
    await client.seed("s1", new Uint8Array([1]));
    expect(headersSeen.join("")).toContain("Bearer svc-only");
    expect(headersSeen.join("")).not.toMatch(/ticket/i);
  });
});
