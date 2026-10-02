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

function deps(
  generate = jest.fn().mockResolvedValue({ base64: "IMG", mimeType: "image/jpeg" }),
  translate = jest.fn().mockResolvedValue("The translated concept"),
) {
  return {
    deps: {
      env,
      createGenerator: jest.fn().mockReturnValue(generate),
      createTranslator: jest.fn().mockReturnValue(translate),
    },
    generate,
    translate,
  };
}

describe("handleIllustrationRequest", () => {
  it("正常なラベルで画像を返し、プロンプトにラベルを含める", async () => {
    const { deps: d, generate } = deps();

    const response = await handleIllustrationRequest(post({ label: "  企画の背景 " }), d);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ image: "IMG", mimeType: "image/jpeg" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain("The translated concept");
  });

  it("日本語のラベルは、翻訳を1回だけ呼び、プロンプトには英語だけを入れる", async () => {
    const { deps: d, generate, translate } = deps();

    await handleIllustrationRequest(post({ label: "  企画の背景 " }), d);

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("企画の背景");
    expect(generate.mock.calls[0][0]).toContain("The translated concept");
    expect(generate.mock.calls[0][0]).not.toContain("企画の背景");
  });

  it("ASCII だけのラベルは翻訳せず、そのままプロンプトに入れる", async () => {
    const { deps: d, generate, translate } = deps();

    await handleIllustrationRequest(post({ label: " Budget plan " }), d);

    expect(translate).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][0]).toContain("concept: Budget plan.");
  });

  it("翻訳が無料枠超過なら 429 で、生成しない", async () => {
    const { deps: d, generate } = deps(undefined, jest.fn().mockRejectedValue(new ImageGenerationError("quota-exceeded", "q")));

    const response = await handleIllustrationRequest(post({ label: "目標" }), d);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "quota-exceeded" });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ["upstream-error", new ImageGenerationError("upstream-error", "u")],
    ["想定外の例外", new Error("secret internal detail")],
  ])("翻訳が失敗（%s）したら 502 で、生成せず、日本語のラベルに戻さない", async (_name, error) => {
    const { deps: d, generate } = deps(undefined, jest.fn().mockRejectedValue(error));

    const response = await handleIllustrationRequest(post({ label: "目標" }), d);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream-error" });
    expect(generate).not.toHaveBeenCalled();
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
    const createTranslator = jest.fn();

    const response = await handleIllustrationRequest(post({ label: "目標" }), { env: {}, createGenerator, createTranslator });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not-configured" });
    expect(createGenerator).not.toHaveBeenCalled();
  });

  it("設定が無くても、不正なラベルは 400（設定の有無を漏らさない順序）", async () => {
    const response = await handleIllustrationRequest(post({ label: "" }), {
      env: {},
      createGenerator: jest.fn(),
      createTranslator: jest.fn(),
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

  describe("NSFW の誤判定への再試行", () => {
    const rejected = () => new ImageGenerationError("content-rejected", "r");
    const ok = { base64: "IMG", mimeType: "image/jpeg" };

    it("content-rejected が2回続いても、3回目に成功すれば 200（生成は3回）", async () => {
      const generate = jest.fn().mockRejectedValueOnce(rejected()).mockRejectedValueOnce(rejected()).mockResolvedValueOnce(ok);
      const { deps: d } = deps(generate);

      const response = await handleIllustrationRequest(post({ label: "目標" }), d);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ image: "IMG", mimeType: "image/jpeg" });
      expect(generate).toHaveBeenCalledTimes(3);
    });

    it("3回とも content-rejected なら 422 で、生成はちょうど3回", async () => {
      const { deps: d, generate } = deps(jest.fn().mockRejectedValue(rejected()));

      const response = await handleIllustrationRequest(post({ label: "目標" }), d);

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "content-rejected" });
      expect(generate).toHaveBeenCalledTimes(3);
    });

    it("upstream-error は再試行せず 502", async () => {
      const { deps: d, generate } = deps(jest.fn().mockRejectedValue(new ImageGenerationError("upstream-error", "u")));

      const response = await handleIllustrationRequest(post({ label: "目標" }), d);

      expect(response.status).toBe(502);
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it("quota-exceeded は再試行せず 429", async () => {
      const { deps: d, generate } = deps(jest.fn().mockRejectedValue(new ImageGenerationError("quota-exceeded", "q")));

      const response = await handleIllustrationRequest(post({ label: "目標" }), d);

      expect(response.status).toBe(429);
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it("生成を3回試しても、翻訳は1回だけ", async () => {
      const { deps: d, translate } = deps(jest.fn().mockRejectedValue(rejected()));

      await handleIllustrationRequest(post({ label: "目標" }), d);

      expect(translate).toHaveBeenCalledTimes(1);
    });

    it("1回目に成功すれば、生成は1回だけ", async () => {
      const { deps: d, generate } = deps();

      await handleIllustrationRequest(post({ label: "目標" }), d);

      expect(generate).toHaveBeenCalledTimes(1);
    });
  });
});
