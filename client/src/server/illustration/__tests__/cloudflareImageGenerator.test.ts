/** @jest-environment node */
import {
  ImageGenerationError,
  createCloudflareImageGenerator,
  readCloudflareConfig,
} from "@/server/illustration/cloudflareImageGenerator";

const config = { accountId: "acct-123", apiToken: "secret-token-xyz" };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("readCloudflareConfig", () => {
  it("2つの環境変数が揃っていれば設定を返す", () => {
    expect(readCloudflareConfig({
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "secret-token-xyz",
    })).toEqual(config);
  });

  it.each([
    [{}],
    [{ CLOUDFLARE_ACCOUNT_ID: "acct-123" }],
    [{ CLOUDFLARE_API_TOKEN: "secret-token-xyz" }],
    [{ CLOUDFLARE_ACCOUNT_ID: "", CLOUDFLARE_API_TOKEN: "secret-token-xyz" }],
    [{ CLOUDFLARE_ACCOUNT_ID: "acct-123", CLOUDFLARE_API_TOKEN: "   " }],
  ])("不足・空の場合は null を返す", (env) => {
    expect(readCloudflareConfig(env)).toBeNull();
  });
});

describe("readCloudflareConfig（アカウントIDの検証）", () => {
  it.each([["acct/evil"], ["acct?x=1"], ["acct#frag"], [".."], ["acct 123"], ["a/../b"]])(
    "URLを壊し得るアカウントID（%s）は null を返す",
    (accountId) => {
      expect(
        readCloudflareConfig({ CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "secret-token-xyz" }),
      ).toBeNull();
    },
  );
});

describe("createCloudflareImageGenerator のタイムアウト", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function abortableFetch() {
    return jest.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    );
  }

  it("上流が応答しないときは、タイムアウトで upstream-error になる", async () => {
    jest.useFakeTimers();
    const fetchImpl = abortableFetch();
    const result = createCloudflareImageGenerator(config, fetchImpl as unknown as typeof fetch, 5_000)("p");
    const assertion = expect(result).rejects.toMatchObject({
      kind: "upstream-error",
      message: expect.not.stringContaining("secret-token-xyz"),
    });

    await jest.advanceTimersByTimeAsync(5_000);

    await assertion;
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("正常に完了したら、タイマーを解除する", async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: true, result: { image: "B" }, errors: [] }),
    );

    await createCloudflareImageGenerator(config, fetchImpl)("p");

    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("createCloudflareImageGenerator", () => {
  it("正しいURL・認証ヘッダー・本文でPOSTし、画像を返す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: true, result: { image: "BASE64DATA" }, errors: [] }),
    );

    const image = await createCloudflareImageGenerator(config, fetchImpl)("a prompt");

    expect(image).toEqual({ base64: "BASE64DATA", mimeType: "image/jpeg" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/black-forest-labs/flux-1-schnell",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret-token-xyz",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toMatchObject({ prompt: "a prompt", steps: 4 });
  });

  it("HTTP 429 は quota-exceeded", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, errors: [{ code: 1, message: "rate" }] }, { status: 429 }),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      name: "ImageGenerationError",
      kind: "quota-exceeded",
    });
  });

  it("無料枠の超過を示すメッセージは quota-exceeded", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(
        { success: false, errors: [{ code: 4006, message: "daily free allocation of neurons used up" }] },
        { status: 400 },
      ),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "quota-exceeded",
    });
  });

  it("HTTP 500 は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, errors: [{ code: 9, message: "boom" }] }, { status: 500 }),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("success が false なら upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, result: { image: "X" }, errors: [] }),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("画像が含まれない応答は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true, result: {} }));

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toBeInstanceOf(
      ImageGenerationError,
    );
  });

  it("JSONでない応答は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("fetch が例外を投げたら upstream-error", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network down"));

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("エラーのメッセージにAPIトークンを含めない", async () => {
    const failures = [
      jest.fn().mockResolvedValue(jsonResponse({ success: false, errors: [{ message: "x" }] }, { status: 500 })),
      jest.fn().mockRejectedValue(new Error("failed with Bearer secret-token-xyz")),
    ];

    for (const fetchImpl of failures) {
      const error = await createCloudflareImageGenerator(config, fetchImpl)("p").catch((e) => e);
      expect(String(error.message)).not.toContain("secret-token-xyz");
    }
  });
});
