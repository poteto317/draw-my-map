/** @jest-environment node */

import { createD1Client } from "@/services/share/d1Client";

const config = {
  accountId: "acct-123",
  apiToken: "api-token-secret",
  databaseId: "db-uuid-456",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createD1Client", () => {
  it("exec は D1 query REST へ sql と params を POST する", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        result: [{ results: [{ id: "1" }], success: true }],
        errors: [],
        messages: [],
      }),
    );
    const client = createD1Client(config, fetchImpl);

    const result = await client.exec("SELECT * FROM users WHERE id = ?", ["1"]);

    expect(result).toEqual({
      results: [{ id: "1" }],
      meta: undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/d1/database/db-uuid-456/query",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer api-token-secret",
        "Content-Type": "application/json",
      }),
    );
    expect(JSON.parse(String(init.body))).toEqual({
      sql: "SELECT * FROM users WHERE id = ?",
      params: ["1"],
    });
  });

  it("params 省略時は空配列を送る", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        result: [{ results: [], success: true }],
        errors: [],
        messages: [],
      }),
    );
    const client = createD1Client(config, fetchImpl);

    await client.exec("SELECT 1");

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body))).toEqual({
      sql: "SELECT 1",
      params: [],
    });
  });

  it("success:false や非 2xx はエラーにする（秘密をメッセージに載せない）", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, errors: [{ message: "bad" }], result: [] }, 400),
    );
    const client = createD1Client(config, fetchImpl);

    await expect(client.exec("SELECT 1")).rejects.toThrow("d1-query-failed");
  });

  it("ネットワーク失敗も固定文言で失敗する", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNRESET api-token-secret"));
    const client = createD1Client(config, fetchImpl);

    await expect(client.exec("SELECT 1")).rejects.toThrow("d1-query-failed");
  });
});
