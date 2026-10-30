/** @jest-environment node */
import { runCloudflareModel } from "@/server/illustration/cloudflareRunModel";

const config = { accountId: "acct-123", apiToken: "secret-token-xyz" };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function run(response: Response) {
  const fetchImpl = jest.fn().mockResolvedValue(response);
  return runCloudflareModel(config, "@cf/test/model", { input: 1 }, { fetchImpl });
}

describe("runCloudflareModel", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("成功した応答の result をそのまま返す（中身は検証しない）", async () => {
    await expect(run(jsonResponse({ success: true, result: { anything: [1, 2] } }))).resolves.toEqual({
      anything: [1, 2],
    });
    await expect(run(jsonResponse({ success: true, result: null }))).resolves.toBeNull();
    await expect(run(jsonResponse({ success: true }))).resolves.toBeUndefined();
  });

  it("fetchImpl を渡さないときはグローバルの fetch を使う", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ success: true, result: "R" }));

    await expect(runCloudflareModel(config, "@cf/test/model", { input: 1 })).resolves.toBe("R");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/test/model",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ input: 1 }) }),
    );
  });

  describe("応答本文の形が想定と違う", () => {
    it.each([
      ["null", null],
      ["配列", [{ success: true, result: "R" }]],
      ["文字列", "success"],
      ["数値", 1],
    ])("HTTP 200 の本文が%sなら upstream-error", async (_name, body) => {
      await expect(run(jsonResponse(body))).rejects.toMatchObject({ kind: "upstream-error" });
    });

    it.each([
      ["文字列の \"true\"", "true"],
      ["数値の 1", 1],
    ])("success が%sなら成功とみなさず upstream-error", async (_name, success) => {
      await expect(run(jsonResponse({ success, result: "R" }))).rejects.toMatchObject({
        kind: "upstream-error",
      });
    });

    it.each([
      ["errors が文字列", { success: false, errors: "NSFW" }],
      ["errors の先頭が null", { success: false, errors: [null] }],
      ["errors が空の配列", { success: false, errors: [] }],
      ["code が文字列の \"8007\"", { success: false, errors: [{ code: "8007", message: "bad input" }] }],
      ["message が文字列でない", { success: false, errors: [{ code: 1, message: ["NSFW"] }] }],
    ])("400 で%sなら content-rejected と判定せず upstream-error", async (_name, body) => {
      await expect(run(jsonResponse(body, { status: 400 }))).rejects.toMatchObject({
        kind: "upstream-error",
      });
    });

    it("message が文字列でなければ、無料枠の超過のパターンを照合しない", async () => {
      await expect(
        run(jsonResponse({ success: false, errors: [{ code: 4006, message: ["quota"] }] }, { status: 403 })),
      ).rejects.toMatchObject({ kind: "upstream-error" });
    });

    it("errors の2件目以降は判定に使わない", async () => {
      await expect(
        run(jsonResponse(
          { success: false, errors: [{ code: 1, message: "bad" }, { code: 8007, message: "NSFW" }] },
          { status: 400 },
        )),
      ).rejects.toMatchObject({ kind: "upstream-error" });
    });
  });
});
