/** @jest-environment node */
import { AiAssistError, type AiAssistErrorKind } from "@/server/aiAssist/aiTextGenerator";
import { BRANCH_SUMMARY_TASK } from "@/server/aiAssist/aiAssistTasks";
import { handleAiAssistRequest, handleAiAssistStatusRequest } from "@/server/aiAssist/handleAiAssistRequest";

const ENV = { ANTHROPIC_API_KEY: "a-key" };
const branch = {
  rootId: 1,
  nodes: [
    { id: 1, parentId: null, label: "根", importance: "high" },
    { id: 2, parentId: 1, label: "子", importance: "low" },
  ],
};

function post(body: unknown, headers: Record<string, string> = {}, raw = false): Request {
  return new Request("http://localhost:3000/api/ai-assist/branch-summary", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

function deps(generate: jest.Mock = jest.fn().mockResolvedValue({ summary: "要約" }), env: Record<string, string | undefined> = ENV) {
  const createGenerator = jest.fn().mockReturnValue(generate);
  return { deps: { env, createGenerator }, generate, createGenerator };
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: code });
}

describe("handleAiAssistRequest の送信元の確認（L-1034）", () => {
  it.each<[string, Record<string, string>]>([
    ["Content-Type が text/plain", { "content-type": "text/plain" }],
    ["別の Origin", { origin: "https://evil.example" }],
    ["Origin: null", { origin: "null" }],
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site" }],
  ])("%s は 403 forbidden で、本文を読まず generator も作らない", async (_name, headers) => {
    const { deps: d, generate, createGenerator } = deps();
    const request = post({ branch }, headers);
    await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 403, "forbidden");
    expect(request.bodyUsed).toBe(false);
    expect(createGenerator).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("text/plain で 256 KB を超える本文は 413 ではなく 403（送信元・Content-Type の確認がサイズより先）", async () => {
    const { deps: d } = deps();
    const request = post("{".repeat(256 * 1024 + 1), { "content-type": "text/plain" }, true);
    await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 403, "forbidden");
    expect(request.bodyUsed).toBe(false);
  });

  it("Origin はあるが Host が無ければ 403 forbidden", async () => {
    const { deps: d, createGenerator } = deps();
    const request = new Request("http://localhost:3000/api/ai-assist/branch-summary", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ branch }),
    });
    expect(request.headers.get("host")).toBeNull();
    await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 403, "forbidden");
    expect(createGenerator).not.toHaveBeenCalled();
  });

  it("ヘッダーが無い（curl など）・同じ Origin・same-origin・charset 付きの JSON は通す", async () => {
    const cases: Record<string, string>[] = [{}, { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }, { "content-type": "Application/JSON; charset=utf-8" }];
    for (const headers of cases) {
      const { deps: d } = deps();
      expect((await handleAiAssistRequest(post({ branch }, headers), BRANCH_SUMMARY_TASK, d)).status).toBe(200);
    }
  });
});

describe("Host の許可リスト（DNS rebinding・LAN 内の別端末を拒む）", () => {
  const rebinding = { host: "evil.test:3000", origin: "http://evil.test:3000", "sec-fetch-site": "same-origin" };

  it.each<[string, Record<string, string>]>([
    ["Host と Origin が一致していても許可外のホスト（DNS rebinding）", rebinding],
    ["LAN の IP の Host（Origin なし）", { host: "192.168.1.10:3000" }],
    ["localhost を含むだけの別名", { host: "localhost.evil.test:3000" }],
    ["ホスト名として読めない Host", { host: "evil@localhost:3000" }],
  ])("POST: %s は 403 で、本文を読まず generator も作らない", async (_name, headers) => {
    const { deps: d, generate, createGenerator } = deps();
    const request = post({ branch }, headers);
    await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 403, "forbidden");
    expect(request.bodyUsed).toBe(false);
    expect(createGenerator).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("POST: Host が無ければ 403", async () => {
    const { deps: d, createGenerator } = deps();
    const request = new Request("http://localhost:3000/api/ai-assist/branch-summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branch }),
    });
    expect(request.headers.get("host")).toBeNull();
    await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 403, "forbidden");
    expect(request.bodyUsed).toBe(false);
    expect(createGenerator).not.toHaveBeenCalled();
  });

  it("GET /status: Host と Origin が一致していても許可外のホストなら 403 で、提供元・モデルを返さない", async () => {
    const response = handleAiAssistStatusRequest(
      new Request("http://evil.test:3000/api/ai-assist/status", { headers: rebinding }),
      { env: ENV },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it.each<string>(["localhost:3000", "localhost", "LOCALHOST:3000", "127.0.0.1:3000", "127.0.0.1", "[::1]:3000", "[::1]"])(
    "既定の許可ホスト %s は通る（ポートは問わない・大文字小文字を区別しない）",
    async (host) => {
      const { deps: d } = deps();
      const origin = `http://${host}`;
      expect((await handleAiAssistRequest(post({ branch }, { host, origin }), BRANCH_SUMMARY_TASK, d)).status).toBe(200);
      const status = handleAiAssistStatusRequest(
        new Request("http://localhost:3000/api/ai-assist/status", { headers: { host } }),
        { env: ENV },
      );
      expect(status.status).toBe(200);
    },
  );

  it("AI_ASSIST_ALLOWED_HOSTS で足したホストは通り、足していないホストは引き続き 403", async () => {
    const env = { ...ENV, AI_ASSIST_ALLOWED_HOSTS: " 192.168.1.10 , MyMac.Local " };
    for (const host of ["192.168.1.10:3000", "mymac.local:3000", "MYMAC.LOCAL"]) {
      const { deps: d } = deps(undefined, env);
      expect((await handleAiAssistRequest(post({ branch }, { host, origin: `http://${host}` }), BRANCH_SUMMARY_TASK, d)).status).toBe(200);
    }
    const { deps: d } = deps(undefined, env);
    await expectError(await handleAiAssistRequest(post({ branch }, rebinding), BRANCH_SUMMARY_TASK, d), 403, "forbidden");
    const status = handleAiAssistStatusRequest(
      new Request("http://192.168.1.10:3000/api/ai-assist/status", { headers: { host: "192.168.1.10:3000" } }),
      { env },
    );
    expect(status.status).toBe(200);
  });

  it("AI_ASSIST_ALLOWED_HOSTS が空白だけなら既定だけ（許可外は 403）", async () => {
    const { deps: d } = deps(undefined, { ...ENV, AI_ASSIST_ALLOWED_HOSTS: "  " });
    await expectError(await handleAiAssistRequest(post({ branch }, { host: "192.168.1.10:3000" }), BRANCH_SUMMARY_TASK, d), 403, "forbidden");
  });
});

describe("handleAiAssistRequest", () => {
  it("成功: 出力を検証して { summary } を返し、request.signal を generator へ渡す", async () => {
    const { deps: d, generate } = deps(jest.fn().mockResolvedValue({ summary: " 要約 " }));
    const request = post({ branch });

    const response = await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ summary: "要約" });
    expect(generate.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 4000, signal: request.signal });
  });

  it("256 KB を超える本文は JSON の解析の前に 413 too-large", async () => {
    const { deps: d } = deps();
    await expectError(await handleAiAssistRequest(post("{".repeat(256 * 1024 + 1), {}, true), BRANCH_SUMMARY_TASK, d), 413, "too-large");
  });

  it("Content-Length が 256 KB を超えていれば本文を読まずに 413 too-large", async () => {
    const { deps: d, createGenerator } = deps();
    const request = post({ branch }, { "content-length": String(256 * 1024 + 1) });
    await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 413, "too-large");
    expect(request.bodyUsed).toBe(false);
    expect(createGenerator).not.toHaveBeenCalled();
  });

  it.each<[string, string]>([
    ["数でない", "abc"],
    ["負数", "-1"],
    ["空文字", ""],
  ])("Content-Length が%s（%j）なら前段で拒否せず、本文を読んで通常どおり処理する", async (_name, contentLength) => {
    const { deps: d, generate } = deps();
    const request = post({ branch }, { "content-length": contentLength });
    expect(request.headers.get("content-length")).toBe(contentLength);

    const response = await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d);

    expect(response.status).toBe(200);
    expect(request.bodyUsed).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("Content-Length を小さく偽った 256 KB 超の本文は、読んだ後の最終判定で 413 too-large", async () => {
    const { deps: d, createGenerator } = deps();
    const request = post("{".repeat(256 * 1024 + 1), { "content-length": "10" }, true);
    expect(request.headers.get("content-length")).toBe("10");

    await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 413, "too-large");
    expect(request.bodyUsed).toBe(true);
    expect(createGenerator).not.toHaveBeenCalled();
  });

  describe("Content-Length の無い分割転送の本文", () => {
    const CHUNK = 64 * 1024;

    // 64 KiB の "{" を最大 maxChunks 回流す。何個読まれたかと、打ち切られたかを記録する
    function chunkedPost(maxChunks: number, lastChunkBytes = CHUNK) {
      const record = { pulled: 0, cancelled: false };
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (record.pulled >= maxChunks) {
            controller.close();
            return;
          }
          record.pulled += 1;
          const size = record.pulled === maxChunks ? lastChunkBytes : CHUNK;
          controller.enqueue(new TextEncoder().encode("{".repeat(size)));
        },
        cancel() {
          record.cancelled = true;
        },
      }, { highWaterMark: 0 });
      const request = new Request("http://localhost:3000/api/ai-assist/branch-summary", {
        method: "POST",
        headers: { "content-type": "application/json", host: "localhost:3000" },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      expect(request.headers.get("content-length")).toBeNull();
      return { request, record };
    }

    it("上限を超えた時点で読むのをやめて 413 too-large（長いストリームを最後まで読まない）", async () => {
      const { deps: d, createGenerator } = deps();
      const { request, record } = chunkedPost(1000); // 約 64 MiB
      await expectError(await handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, d), 413, "too-large");
      expect(record.pulled).toBeLessThanOrEqual(6); // 上限は 4 個ぶん。5 個目で超える
      expect(record.cancelled).toBe(true);
      expect(createGenerator).not.toHaveBeenCalled();
    });

    it("上限ちょうど（256 KiB）は 413 にせず解析に進み、1 バイト超えると 413", async () => {
      const exact = chunkedPost(4);
      await expectError(await handleAiAssistRequest(exact.request, BRANCH_SUMMARY_TASK, deps().deps), 400, "invalid-request");
      const over = chunkedPost(5, 1);
      await expectError(await handleAiAssistRequest(over.request, BRANCH_SUMMARY_TASK, deps().deps), 413, "too-large");
    });
  });

  it("256 KB ちょうどは 413 にせず、解析に進む（壊れた JSON なので 400 invalid-request）", async () => {
    const { deps: d } = deps();
    await expectError(await handleAiAssistRequest(post("{".repeat(256 * 1024), {}, true), BRANCH_SUMMARY_TASK, d), 400, "invalid-request");
  });

  it("上限は UTF-8 のバイト数で数える（length は 256K 未満でも 262,146 バイトなら 413）", async () => {
    const { deps: d } = deps();
    const text = "あ".repeat(87_382);
    expect(text.length).toBeLessThan(256 * 1024);
    expect(new TextEncoder().encode(text).length).toBe(262_146);
    await expectError(await handleAiAssistRequest(post(text, {}, true), BRANCH_SUMMARY_TASK, d), 413, "too-large");
  });

  it("JSON でない・形が違うは 400 invalid-request（設定の確認より先）", async () => {
    const { deps: d } = deps(undefined, {});
    await expectError(await handleAiAssistRequest(post("{", {}, true), BRANCH_SUMMARY_TASK, d), 400, "invalid-request");
    await expectError(await handleAiAssistRequest(post({ branch: {} }), BRANCH_SUMMARY_TASK, d), 400, "invalid-request");
  });

  it("設定が無ければ 503 not-configured", async () => {
    const { deps: d, createGenerator } = deps(undefined, {});
    await expectError(await handleAiAssistRequest(post({ branch }), BRANCH_SUMMARY_TASK, d), 503, "not-configured");
    expect(createGenerator).not.toHaveBeenCalled();
  });

  it.each<[AiAssistErrorKind, number, string]>([
    ["rate-limited", 429, "rate-limited"],
    ["auth-failed", 502, "auth-failed"],
    ["timeout", 504, "timeout"],
    ["refused", 422, "refused"],
    ["truncated", 502, "invalid-output"],
    ["invalid-output", 502, "invalid-output"],
    ["aborted", 502, "upstream-error"],
    ["upstream-error", 502, "upstream-error"],
  ])("生成の誤り %s は %i %s", async (kind, status, code) => {
    const { deps: d } = deps(jest.fn().mockRejectedValue(new AiAssistError(kind)));
    await expectError(await handleAiAssistRequest(post({ branch }), BRANCH_SUMMARY_TASK, d), status, code);
  });

  it("想定外の例外は内部の情報を返さず 502 upstream-error", async () => {
    const { deps: d } = deps(jest.fn().mockRejectedValue(new Error("sk-secret")));
    const response = await handleAiAssistRequest(post({ branch }), BRANCH_SUMMARY_TASK, d);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("{\"error\":\"upstream-error\"}");
  });

  it("出力の検証に違反すれば 502 invalid-output", async () => {
    const { deps: d } = deps(jest.fn().mockResolvedValue({ summary: "" }));
    await expectError(await handleAiAssistRequest(post({ branch }), BRANCH_SUMMARY_TASK, d), 502, "invalid-output");
  });
});

describe("handleAiAssistStatusRequest", () => {
  function get(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost:3000/api/ai-assist/status", { headers: { host: "localhost:3000", ...headers } });
  }

  it("設定があれば提供元・表示名・モデルを返す（キーは返さない）", async () => {
    const response = handleAiAssistStatusRequest(get(), { env: ENV });
    expect(await response.json()).toEqual({
      available: true, provider: "anthropic", providerLabel: "Anthropic（Claude API）", model: "claude-opus-5-5",
    });
  });

  it("設定が無ければ available: false", async () => {
    expect(await handleAiAssistStatusRequest(get(), { env: {} }).json()).toEqual({ available: false });
  });

  it("別の Origin からは 403 forbidden（GET は Content-Type を見ない）", async () => {
    const response = handleAiAssistStatusRequest(get({ origin: "https://evil.example" }), { env: ENV });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });
});
