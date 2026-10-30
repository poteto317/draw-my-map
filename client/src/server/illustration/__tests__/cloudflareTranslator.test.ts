/** @jest-environment node */
import { createCloudflareTranslator } from "@/server/illustration/cloudflareTranslator";

const config = { accountId: "acct-123", apiToken: "secret-token-xyz" };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const ok = (text: unknown) => jsonResponse({ success: true, errors: [], result: { translated_text: text } });

describe("createCloudflareTranslator", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("正しいURL・認証ヘッダー・本文でPOSTし、前後の空白を除いた訳を返す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok("  The budget \n"));

    const text = await createCloudflareTranslator(config, fetchImpl)("予算");

    expect(text).toBe("The budget");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/meta/m2m100-1.2b");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret-token-xyz",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({ text: "予算", source_lang: "japanese", target_lang: "english" });
  });

  it("HTTP 429 は quota-exceeded", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: false, errors: [] }, { status: 429 }));

    await expect(createCloudflareTranslator(config, fetchImpl)("予算")).rejects.toMatchObject({
      name: "ImageGenerationError",
      kind: "quota-exceeded",
    });
  });

  it.each([
    ["HTTP 500", () => jsonResponse({ success: false, errors: [{ message: "boom" }] }, { status: 500 })],
    ["success が false", () => jsonResponse({ success: false, result: { translated_text: "x" }, errors: [] })],
    ["translated_text が無い", () => jsonResponse({ success: true, result: {} })],
    ["translated_text が空文字", () => ok("   ")],
    ["translated_text が文字列でない", () => ok(5)],
    ["result が null", () => jsonResponse({ success: true, errors: [], result: null })],
    ["result が文字列", () => jsonResponse({ success: true, errors: [], result: "hello" })],
    ["result が配列", () => jsonResponse({ success: true, errors: [], result: [{ translated_text: "x" }] })],
  ])("%s は upstream-error", async (_name, makeResponse) => {
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse());

    await expect(createCloudflareTranslator(config, fetchImpl)("予算")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("ヘッダー受信後に本文が止まっても、タイムアウトで upstream-error になりタイマーが残らない", async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn((_url: unknown, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      } as unknown as Response),
    );
    const result = createCloudflareTranslator(config, fetchImpl as unknown as typeof fetch, 5_000)("予算");
    const assertion = expect(result).rejects.toMatchObject({ kind: "upstream-error" });

    await jest.advanceTimersByTimeAsync(5_000);

    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it("エラーのメッセージにAPIトークンを含めない", async () => {
    const failures = [
      jest.fn().mockResolvedValue(jsonResponse({ success: false, errors: [{ message: "x" }] }, { status: 500 })),
      jest.fn().mockRejectedValue(new Error("failed with Bearer secret-token-xyz")),
    ];

    for (const fetchImpl of failures) {
      const error = await createCloudflareTranslator(config, fetchImpl)("予算").catch((e) => e);
      expect(String(error.message)).not.toContain("secret-token-xyz");
    }
  });
});
