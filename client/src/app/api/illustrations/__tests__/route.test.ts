/** @jest-environment node */
import { POST } from "@/app/api/illustrations/route";

describe("POST /api/illustrations", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("認証情報が未設定なら 503 not-configured を返す（環境変数から設定を読む配線）", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;

    const response = await POST(new Request("http://localhost/api/illustrations", {
      method: "POST",
      body: JSON.stringify({ label: "目標" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not-configured" });
  });

  it("不正なラベルは 400 を返す", async () => {
    const response = await POST(new Request("http://localhost/api/illustrations", {
      method: "POST",
      body: JSON.stringify({ label: "" }),
    }));

    expect(response.status).toBe(400);
  });

  describe("認証情報が設定済みのとき（Cloudflare の実装への配線）", () => {
    function illustrationRequest(label: string): Request {
      return new Request("http://localhost/api/illustrations", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
    }

    function cloudflareSuccess(result: unknown): Response {
      return new Response(JSON.stringify({ success: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    function requestedBody(call: Parameters<typeof fetch>): unknown {
      return JSON.parse(String(call[1]?.body));
    }

    beforeEach(() => {
      process.env.CLOUDFLARE_ACCOUNT_ID = "acct-123";
      process.env.CLOUDFLARE_API_TOKEN = "secret-token-xyz";
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("英語のラベルは翻訳せず、画像生成モデルだけを呼んで画像を返す", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(cloudflareSuccess({ image: "BASE64IMAGE" }));

      const response = await POST(illustrationRequest("Goal"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ image: "BASE64IMAGE", mimeType: "image/jpeg" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][0])).toBe(
        "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/black-forest-labs/flux-1-schnell",
      );
      expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
        Authorization: "Bearer secret-token-xyz",
      });
      expect(requestedBody(fetchSpy.mock.calls[0])).toMatchObject({
        prompt: expect.stringContaining("Goal"),
      });
    });

    it("日本語のラベルは翻訳モデルで英語にしてから、画像生成モデルを呼ぶ", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(cloudflareSuccess({ translated_text: " Project background " }))
        .mockResolvedValueOnce(cloudflareSuccess({ image: "BASE64IMAGE" }));

      const response = await POST(illustrationRequest("企画の背景"));

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(String(fetchSpy.mock.calls[0][0])).toBe(
        "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/meta/m2m100-1.2b",
      );
      expect(requestedBody(fetchSpy.mock.calls[0])).toEqual({
        text: "企画の背景",
        source_lang: "japanese",
        target_lang: "english",
      });
      const { prompt } = requestedBody(fetchSpy.mock.calls[1]) as { prompt: string };
      expect(prompt).toContain("Project background");
      expect(prompt).not.toContain("企画");
    });

    it("上流が 429 を返したら 429 quota-exceeded を返す", async () => {
      jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, errors: [] }), { status: 429 }),
      );

      const response = await POST(illustrationRequest("Goal"));

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "quota-exceeded" });
    });
  });
});
