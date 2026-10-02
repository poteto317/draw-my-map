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
});
