import { createHmac } from "node:crypto";
import { tokenHash } from "@/domain/share/tokenHash";

describe("tokenHash", () => {
  it("同じ token と secret なら同じハッシュになる", () => {
    const a = tokenHash("plain-token", "secret-one");
    const b = tokenHash("plain-token", "secret-one");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("平文 token をそのまま返さない（一方向）", () => {
    const token = "plain-token-xyz";
    const hash = tokenHash(token, "secret-one");
    expect(hash).not.toBe(token);
    expect(hash.includes(token)).toBe(false);
  });

  it("secret が違えばハッシュが変わる", () => {
    expect(tokenHash("token", "secret-a")).not.toBe(tokenHash("token", "secret-b"));
  });

  it("token が違えばハッシュが変わる", () => {
    expect(tokenHash("token-a", "secret")).not.toBe(tokenHash("token-b", "secret"));
  });

  it("HMAC-SHA256 の hex と一致する", () => {
    const token = "view-token";
    const secret = "hmac-secret";
    const expected = createHmac("sha256", secret).update(token, "utf8").digest("hex");
    expect(tokenHash(token, secret)).toBe(expected);
  });
});
