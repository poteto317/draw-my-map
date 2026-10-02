/** @jest-environment node */
import { ImageGenerationError } from "@/server/illustration/cloudflareImageGenerator";
import { handleIllustrationRequest } from "@/server/illustration/handleIllustrationRequest";

const env = { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "token" };

function post(body: unknown, raw = false): Request {
  return new Request("http://localhost/api/illustrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

function deps(generate = jest.fn().mockResolvedValue({ base64: "IMG", mimeType: "image/jpeg" })) {
  return { deps: { env, createGenerator: jest.fn().mockReturnValue(generate) }, generate };
}

describe("handleIllustrationRequest", () => {
  it("正常なラベルで画像を返し、プロンプトにラベルを含める", async () => {
    const { deps: d, generate } = deps();

    const response = await handleIllustrationRequest(post({ label: "  企画の背景 " }), d);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ image: "IMG", mimeType: "image/jpeg" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain("企画の背景");
    expect(generate.mock.calls[0][0]).not.toContain("  企画の背景 ");
  });

  it.each([
    ["JSONでない本文", "not json", true],
    ["配列の本文", [], false],
    ["labelが文字列でない", { label: 1 }, false],
    ["labelが無い", {}, false],
  ])("%s は 400 invalid-request で、生成しない", async (_name, body, raw) => {
    const { deps: d, generate } = deps();

    const response = await handleIllustrationRequest(post(body, raw as boolean), d);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-request" });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([[""], ["   "], ["あ".repeat(201)]])("不正なラベルは 400 invalid-label", async (label) => {
    const { deps: d, generate } = deps();

    const response = await handleIllustrationRequest(post({ label }), d);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-label" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("設定が無ければ 503 not-configured で、生成しない（検証は設定の確認より先）", async () => {
    const createGenerator = jest.fn();

    const response = await handleIllustrationRequest(post({ label: "目標" }), { env: {}, createGenerator });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not-configured" });
    expect(createGenerator).not.toHaveBeenCalled();
  });

  it("設定が無くても、不正なラベルは 400（設定の有無を漏らさない順序）", async () => {
    const response = await handleIllustrationRequest(post({ label: "" }), {
      env: {},
      createGenerator: jest.fn(),
    });

    expect(response.status).toBe(400);
  });

  it("無料枠の超過は 429、その他の生成失敗は 502", async () => {
    const quota = deps(jest.fn().mockRejectedValue(new ImageGenerationError("quota-exceeded", "q")));
    const upstream = deps(jest.fn().mockRejectedValue(new ImageGenerationError("upstream-error", "u")));

    const quotaResponse = await handleIllustrationRequest(post({ label: "目標" }), quota.deps);
    const upstreamResponse = await handleIllustrationRequest(post({ label: "目標" }), upstream.deps);

    expect(quotaResponse.status).toBe(429);
    expect(await quotaResponse.json()).toEqual({ error: "quota-exceeded" });
    expect(upstreamResponse.status).toBe(502);
    expect(await upstreamResponse.json()).toEqual({ error: "upstream-error" });
  });

  it("想定外の例外も 502 とし、内部のメッセージを返さない", async () => {
    const { deps: d } = deps(jest.fn().mockRejectedValue(new Error("secret internal detail")));

    const response = await handleIllustrationRequest(post({ label: "目標" }), d);

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret internal detail");
  });
});
