/** @jest-environment node */

import { createD1Client, D1QueryError, isD1MissingTableError } from "@/services/share/d1Client";

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

  /*
   * 失敗応答の形の根拠（L-059）:
   * Cloudflare API リファレンス「D1 > Database > Query D1 Database」の「Returns」節
   * （https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/ 、2026-11-27 確認）。
   * 応答は `{ success: boolean, errors: Array<{ code: number; message: string; documentation_url?; source? }>, messages, result }`。
   * 「no such table: <name>」という文言自体は公式ドキュメントに例が無く、SQLite のエラー文言（D1 は SQLite）を
   * `errors[].message` に載せる前提で判定する。大文字小文字・接頭辞（例: "D1_ERROR: "）の違いに備えて
   * 小文字化した部分一致にする。実環境の文言は手動テスト（Phase 38 の DDL 未実行環境で共有解除が成功）で確かめる。
   */
  describe("D1QueryError", () => {
    async function captureError(fetchImpl: jest.Mock): Promise<unknown> {
      const client = createD1Client(config, fetchImpl);
      try {
        await client.exec("DELETE FROM share_comments WHERE shared_map_id = ?", ["m1"]);
      } catch (error) {
        return error;
      }
      throw new Error("expected exec to throw");
    }

    it("errors[].message に no such table を含む失敗応答は kind が no-such-table（生メッセージは載せない）", async () => {
      const error = await captureError(
        jest.fn().mockResolvedValue(
          jsonResponse(
            {
              success: false,
              errors: [{ code: 7500, message: "no such table: share_comments: SQLITE_ERROR" }],
              messages: [],
              result: [],
            },
            400,
          ),
        ),
      );

      expect(error).toBeInstanceOf(D1QueryError);
      expect((error as D1QueryError).kind).toBe("no-such-table");
      expect((error as D1QueryError).message).toBe("d1-query-failed");
      expect((error as D1QueryError).name).toBe("D1QueryError");
      expect(isD1MissingTableError(error)).toBe(true);
    });

    it("大文字の接頭辞付きや 2 件目の errors でも no such table を判定する", async () => {
      const error = await captureError(
        jest.fn().mockResolvedValue(
          jsonResponse(
            {
              success: false,
              errors: [
                { code: 7500, message: 123 },
                { code: 7500, message: "D1_ERROR: No Such Table: share_comment_threads" },
              ],
              result: [],
            },
            400,
          ),
        ),
      );

      expect((error as D1QueryError).kind).toBe("no-such-table");
    });

    it("それ以外の失敗応答は kind が failed", async () => {
      const error = await captureError(
        jest.fn().mockResolvedValue(
          jsonResponse(
            { success: false, errors: [{ code: 7500, message: "no such column: foo" }], result: [] },
            400,
          ),
        ),
      );

      expect(error).toBeInstanceOf(D1QueryError);
      expect((error as D1QueryError).kind).toBe("failed");
      expect((error as D1QueryError).message).toBe("d1-query-failed");
      expect(isD1MissingTableError(error)).toBe(false);
    });

    it("errors が配列でない失敗応答は kind が failed", async () => {
      const error = await captureError(
        jest.fn().mockResolvedValue(
          jsonResponse({ success: false, errors: "no such table: share_comments" }, 400),
        ),
      );

      expect((error as D1QueryError).kind).toBe("failed");
    });

    it("2xx でも success が true でなければ kind が failed", async () => {
      const error = await captureError(
        jest.fn().mockResolvedValue(jsonResponse({ success: false, errors: [], result: [] })),
      );

      expect((error as D1QueryError).kind).toBe("failed");
    });

    it("fetch の例外は kind が failed（生メッセージを載せない）", async () => {
      const error = await captureError(
        jest.fn().mockRejectedValue(new Error("no such table: share_comments api-token-secret")),
      );

      expect(error).toBeInstanceOf(D1QueryError);
      expect((error as D1QueryError).kind).toBe("failed");
      expect((error as D1QueryError).message).toBe("d1-query-failed");
    });

    it("JSON でない本文は kind が failed", async () => {
      const error = await captureError(
        jest.fn().mockResolvedValue(new Response("no such table: share_comments", { status: 500 })),
      );

      expect(error).toBeInstanceOf(D1QueryError);
      expect((error as D1QueryError).kind).toBe("failed");
    });
  });

  describe("isD1MissingTableError", () => {
    it("D1QueryError 以外は false", () => {
      expect(isD1MissingTableError(new Error("no such table: share_comments"))).toBe(false);
      expect(isD1MissingTableError(null)).toBe(false);
      expect(isD1MissingTableError(new D1QueryError("failed"))).toBe(false);
      expect(isD1MissingTableError(new D1QueryError("no-such-table"))).toBe(true);
    });
  });
});
